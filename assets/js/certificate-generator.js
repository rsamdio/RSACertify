// Certificate Generation Module - Dynamic Dimension & PDF Output
class CertificateGenerator {
    constructor() {
        this.db = null;
        this.libraries = {};
        this.init();
    }
    
    init() {
        if (typeof firebase !== 'undefined') {
            this.db = firebase.firestore();
        }
    }
    
    // Generate certificate with participant data
    async generateCertificate(eventSlug, participant, eventConfig) {
        try {
            
            // Load certificate template
            const template = await this.loadTemplate(eventConfig.template);
            
            // Create canvas with dynamic dimensions based on template
            const canvas = await this.createCanvasWithTemplate(template);
            
            // Apply participant data to certificate
            await this.applyParticipantData(canvas, participant, eventConfig.participantFields);
            
            // Convert canvas to PDF
            const pdf = await this.createPDF(canvas);
            
            // Return PDF blob for download
            return pdf;
            
        } catch (error) {
            throw error;
        }
    }
    
    // Load certificate template from local assets
    async loadTemplate(templatePath) {
        try {
            // If template path is provided, try to load from local assets
            if (templatePath && templatePath !== '/assets/templates/default.png') {
                // Try to load from local assets directory
                const fullPath = templatePath.startsWith('/') ? templatePath : `/assets/templates/${templatePath}`;
                return await this.loadImage(fullPath);
            } else {
                // Use default template
                return this.createDefaultTemplate();
            }
        } catch (error) {
            return this.createDefaultTemplate();
        }
    }
    
    // Load image and return as Image object
    async loadImage(src) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.crossOrigin = 'anonymous';
            
            img.onload = () => resolve(img);
            img.onerror = () => reject(new Error(`Failed to load image: ${src}`));
            
            img.src = src;
        });
    }
    
    // Create canvas with template image dimensions
    async createCanvasWithTemplate(templateImage) {
        try {
            
            // Create canvas with template image dimensions
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            
            // Set canvas size to match template image
            canvas.width = templateImage.naturalWidth;
            canvas.height = templateImage.naturalHeight;
            
            // Draw the template image
            ctx.drawImage(templateImage, 0, 0, canvas.width, canvas.height);
            
            return canvas;
            
        } catch (error) {
            throw error;
        }
    }
    
    // Create default certificate template
    createDefaultTemplate() {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        
        // Default A4 dimensions at 96 DPI
        canvas.width = 794;
        canvas.height = 1123;
        
        // Create gradient background
        const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
        gradient.addColorStop(0, '#f8f9fa');
        gradient.addColorStop(1, '#e9ecef');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        // Add border
        ctx.strokeStyle = '#dee2e6';
        ctx.lineWidth = 2;
        ctx.strokeRect(20, 20, canvas.width - 40, canvas.height - 40);
        
        // Add title
        ctx.fillStyle = '#495057';
        ctx.font = 'bold 48px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('Certificate of Completion', canvas.width / 2, 150);
        
        // Add subtitle
        ctx.fillStyle = '#6c757d';
        ctx.font = '24px Arial';
        ctx.fillText('This is to certify that', canvas.width / 2, 220);
        
        // Add decorative elements
        ctx.strokeStyle = '#adb5bd';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(100, 300);
        ctx.lineTo(canvas.width - 100, 300);
        ctx.stroke();
        
        ctx.beginPath();
        ctx.moveTo(100, canvas.height - 300);
        ctx.lineTo(canvas.width - 100, canvas.height - 300);
        ctx.stroke();
        
        return canvas;
    }
    
    // Apply participant data to certificate dynamically
    async applyParticipantData(canvas, participant, participantFields) {
        try {
            
            const ctx = canvas.getContext('2d');
            
            // Apply each field from the event configuration
            for (const field of participantFields) {
                let value = '';
                
                // Handle different field types and data sources
                if (field.key === 'name') {
                    value = participant.name || '';
                } else if (field.key === 'email') {
                    value = participant.email || '';
                } else if (field.key === 'date') {
                    value = new Date().toLocaleDateString();
                } else if (participant.additionalFields && participant.additionalFields[field.key]) {
                    // Custom field from additionalFields
                    value = participant.additionalFields[field.key] || '';
                } else if (participant[field.key]) {
                    // Direct field access
                    value = participant[field.key] || '';
                }
                
                // Skip if no value and field is not required
                if (!value && field.required !== false) {
                    continue;
                }
                
                // Calculate dynamic positioning based on canvas dimensions
                const x = this.calculateDynamicPosition(field.x, canvas.width, 'x');
                const y = this.calculateDynamicPosition(field.y, canvas.height, 'y');
                const maxWidth = this.calculateDynamicWidth(field.width, canvas.width);
                
                // Calculate optimal font size that fits within the specified width
                const fontSize = this.calculateOptimalFontSize(
                    field.font_size, 
                    canvas.width, 
                    value, 
                    maxWidth, 
                    field.font_family || 'Arial'
                );
                
                // Set font properties
                ctx.font = `${fontSize}px ${field.font_family || 'Arial'}`;
                ctx.fillStyle = field.color || '#000000';
                
                // Set text alignment based on field configuration
                const textAlign = field.text_align || 'left';
                ctx.textAlign = textAlign;
                
                // Calculate x position based on alignment
                let adjustedX = x;
                if (textAlign === 'center') {
                    adjustedX = x + (maxWidth / 2);
                } else if (textAlign === 'right') {
                    adjustedX = x + maxWidth;
                }
                
                
                // Handle text wrapping with alignment
                await this.renderWrappedTextWithAlignment(ctx, value, adjustedX, y, maxWidth, fontSize, textAlign);
                
            }
            
            // Add default date if not specified in fields
            const hasDateField = participantFields.some(f => f.key === 'date');
            if (!hasDateField) {
                ctx.fillStyle = '#6c757d';
                ctx.font = '18px Arial';
                ctx.textAlign = 'center';
                ctx.fillText(`Issued on ${new Date().toLocaleDateString()}`, canvas.width / 2, canvas.height * 0.9);
            }
            
        } catch (error) {
            throw error;
        }
    }
    
    // Calculate dynamic position based on canvas dimensions
    calculateDynamicPosition(value, canvasDimension, axis) {
        if (typeof value === 'number') {
            // If value is a fixed pixel value, scale it proportionally
            const scaleFactor = canvasDimension / 794; // Base on A4 width
            return value * scaleFactor;
        } else if (typeof value === 'string' && value.includes('%')) {
            // If value is a percentage, convert to pixels
            const percentage = parseFloat(value) / 100;
            return canvasDimension * percentage;
        } else {
            // Default positioning
            return axis === 'x' ? canvasDimension * 0.1 : canvasDimension * 0.2;
        }
    }
    
    // Calculate dynamic font size based on canvas dimensions and text length
    calculateDynamicFontSize(baseFontSize, canvasWidth, text) {
        const baseWidth = 794; // Base A4 width
        const scaleFactor = canvasWidth / baseWidth;
        
        // Scale the base font size
        let fontSize = (baseFontSize || 24) * scaleFactor;
        
        // Adjust for text length to prevent overflow
        const maxWidth = canvasWidth * 0.8; // 80% of canvas width
        const estimatedWidth = text.length * fontSize * 0.6; // Rough estimation
        
        if (estimatedWidth > maxWidth) {
            fontSize = Math.max(12, (maxWidth / text.length) * 1.6);
        }
        
        return Math.round(fontSize);
    }
    
    // Calculate optimal font size that fits text within the specified width
    calculateOptimalFontSize(baseFontSize, canvasWidth, text, maxWidth, fontFamily) {
        const baseWidth = 794; // Base A4 width
        const scaleFactor = canvasWidth / baseWidth;
        
        // Start with the base font size scaled to canvas dimensions
        let fontSize = (baseFontSize || 24) * scaleFactor;
        
        // Create a temporary canvas to measure text accurately
        const tempCanvas = document.createElement('canvas');
        const tempCtx = tempCanvas.getContext('2d');
        tempCtx.font = `${fontSize}px ${fontFamily}`;
        
        // Measure the text width
        const textMetrics = tempCtx.measureText(text);
        let textWidth = textMetrics.width;
        
        // If text fits within maxWidth, return the current font size
        if (textWidth <= maxWidth) {
            tempCanvas.remove();
            return Math.round(fontSize);
        }
        
        // Binary search for the optimal font size that fits within maxWidth
        let minFontSize = Math.max(8, fontSize * 0.1); // Minimum font size
        let maxFontSize = fontSize;
        let optimalFontSize = minFontSize;
        
        while (minFontSize <= maxFontSize) {
            const midFontSize = (minFontSize + maxFontSize) / 2;
            tempCtx.font = `${midFontSize}px ${fontFamily}`;
            const metrics = tempCtx.measureText(text);
            const width = metrics.width;
            
            if (width <= maxWidth) {
                optimalFontSize = midFontSize;
                minFontSize = midFontSize + 1;
            } else {
                maxFontSize = midFontSize - 1;
            }
        }
        
        // Clean up temporary canvas
        tempCanvas.remove();
        
        return Math.round(optimalFontSize);
    }
    
    // Calculate dynamic width based on canvas dimensions
    calculateDynamicWidth(baseWidth, canvasWidth) {
        if (typeof baseWidth === 'number') {
            // If value is a fixed pixel value, scale it proportionally
            const baseCanvasWidth = 794; // Base A4 width
            const scaleFactor = canvasWidth / baseCanvasWidth;
            return baseWidth * scaleFactor;
        } else if (typeof baseWidth === 'string' && baseWidth.includes('%')) {
            // If value is a percentage, convert to pixels
            const percentage = parseFloat(baseWidth) / 100;
            return canvasWidth * percentage;
        } else {
            // Default to 80% of canvas width
            return canvasWidth * 0.8;
        }
    }
    
    // Render text with automatic wrapping
    async renderWrappedText(ctx, text, x, y, maxWidth, fontSize) {
        const words = text.toString().split(' ');
        let line = '';
        let currentY = y;
        const lineHeight = fontSize + 5;
        
        for (let n = 0; n < words.length; n++) {
            const testLine = line + words[n] + ' ';
            const metrics = ctx.measureText(testLine);
            const testWidth = metrics.width;
            
            if (testWidth > maxWidth && n > 0) {
                ctx.fillText(line, x, currentY);
                line = words[n] + ' ';
                currentY += lineHeight;
            } else {
                line = testLine;
            }
        }
        
        // Draw the last line
        if (line.trim()) {
            ctx.fillText(line, x, currentY);
        }
    }
    
    // Render text with automatic wrapping and alignment
    async renderWrappedTextWithAlignment(ctx, text, x, y, maxWidth, fontSize, textAlign) {
        const words = text.toString().split(' ');
        let line = '';
        let currentY = y;
        const lineHeight = fontSize + 5;
                
                for (let n = 0; n < words.length; n++) {
                    const testLine = line + words[n] + ' ';
                    const metrics = ctx.measureText(testLine);
                    const testWidth = metrics.width;
                    
                    if (testWidth > maxWidth && n > 0) {
                ctx.fillText(line, x, currentY);
                        line = words[n] + ' ';
                currentY += lineHeight;
                    } else {
                        line = testLine;
                    }
                }
        
        // Draw the last line
        if (line.trim()) {
            ctx.fillText(line, x, currentY);
        }
    }
    
    // Create PDF from canvas
    async createPDF(canvas) {
        try {
            // Load jsPDF library if not already loaded
            if (!this.libraries.jspdf) {
                await this.loadJsPDF();
            }
            
            const { jsPDF } = this.libraries.jspdf;
            
            const canvasWidth = canvas.width;
            const canvasHeight = canvas.height;
            
            // Calculate PDF dimensions to fill the entire page
            const dpi = 96;
            const mmPerPixel = 25.4 / dpi;
            const imgWidth = canvasWidth * mmPerPixel;
            const imgHeight = canvasHeight * mmPerPixel;
            
            // Determine orientation and PDF page size
            const isLandscape = imgWidth > imgHeight;
            const orientation = isLandscape ? 'l' : 'p';
            
            // Use the image dimensions as the PDF page size to eliminate margins
            const pdfDimensions = isLandscape ? [imgHeight, imgWidth] : [imgWidth, imgHeight];
            
            // Create PDF with exact dimensions
            const pdf = new jsPDF(orientation, 'mm', pdfDimensions);
            const imgData = canvas.toDataURL('image/png', 0.95);
            
            // Add image with slight overflow to ensure no white space at edges
            const overflow = 0.5; // 0.5mm overflow on each side
            pdf.addImage(imgData, 'PNG', -overflow, -overflow, imgWidth + (overflow * 2), imgHeight + (overflow * 2), undefined, 'FAST');
            
            return pdf;
            
        } catch (error) {
            throw error;
        }
    }
    
    // Load jsPDF library
    async loadJsPDF() {
        try {
            if (window.jspdf) {
                this.libraries.jspdf = window.jspdf;
                return;
            }
            
            // Load jsPDF from CDN
            const script = document.createElement('script');
            script.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
            
            return new Promise((resolve, reject) => {
                script.onload = () => {
                    if (window.jspdf) {
                        this.libraries.jspdf = window.jspdf;
                        resolve();
                    } else {
                        reject(new Error('jsPDF not loaded properly'));
                    }
                };
                
                script.onerror = () => reject(new Error('Failed to load jsPDF'));
                document.head.appendChild(script);
            });
            
        } catch (error) {
            throw error;
        }
    }
    
    
    // Search for participant in Firestore using event document ID
    async searchParticipant(eventDocId, email) {
        if (!this.db) return null;
        
        try {
            
            // Query the participants subcollection of the specific event
            const querySnapshot = await this.db.collection('events')
                .doc(eventDocId)
                .collection('participants')
                .where('email', '==', email.toLowerCase())
                .limit(1)
                .get();
            
            if (!querySnapshot.empty) {
                const doc = querySnapshot.docs[0];
                const participantData = { id: doc.id, ...doc.data() };
                return participantData;
            }
            
            return null;
            
        } catch (error) {
            throw error;
        }
    }
    
    // Update participant certificate status in Firestore
    async updateParticipantStatus(eventDocId, participantId) {
        if (!this.db) return;
        
        try {
            
            await this.db.collection('events')
                .doc(eventDocId)
                .collection('participants')
                .doc(participantId)
                .update({
                    certificateStatus: 'downloaded',
                    downloadedAt: firebase.firestore.FieldValue.serverTimestamp()
                });
            
            
        } catch (error) {
            throw error;
        }
    }
}

// Export for use in other modules
window.CertificateGenerator = CertificateGenerator;
