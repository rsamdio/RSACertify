# Certificate Templates - Unique Per Event

This directory contains PNG certificate templates for different events. **Each event has its own unique template** to maintain distinct branding and design identity.

## Template Organization

### Current Event Templates

- **`web-dev-workshop.png`** - Unique template for Web Development Workshop
- **`data-science-conf.png`** - Unique template for Data Science Conference  
- **`closed-workshop.png`** - Unique template for Closed Workshop Example

### Template Requirements

- **File Format**: PNG
- **Dimensions**: Any size (system automatically adapts)
- **Background**: White or transparent
- **Content**: Professional certificate design with spaces for dynamic text
- **Quality**: High resolution for crisp PDF output

## Creating Unique Templates for Each Event

### 1. Design Your Template

Each event should have its own distinct design that reflects:
- **Event Branding**: Use event-specific colors, logos, and typography
- **Event Theme**: Incorporate relevant visual elements and imagery
- **Professional Appearance**: Clean, readable design suitable for certificates
- **Text Areas**: Leave clear spaces for participant names, emails, dates, etc.

### 2. Template Specifications

#### **Recommended Dimensions**
- **Standard**: 794x1123 pixels (A4 size at 96 DPI)
- **Wide**: 1200x800 pixels (landscape format)
- **Custom**: Any dimensions you prefer (system adapts automatically)

#### **Design Elements**
- **Header**: Event title and subtitle
- **Main Area**: "This is to certify that [NAME]" section
- **Footer**: Date and signature area
- **Branding**: Event logo, colors, and visual identity
- **Decorative Elements**: Borders, patterns, or background graphics

### 3. File Naming Convention

Use descriptive names that match your event slugs:
```
{event-slug}.png
```

Examples:
- `web-dev-workshop.png`
- `data-science-conf.png`
- `rotary-conference.png`
- `leadership-summit.png`

### 4. Template Placement

Place your PNG templates in this directory:
```
assets/templates/
├── web-dev-workshop.png
├── data-science-conf.png
├── closed-workshop.png
├── your-event.png
└── README.md
```

## Field Positioning

### Understanding Coordinates

The system uses a coordinate system where:
- **Origin**: Top-left corner (0, 0)
- **X-axis**: Horizontal position (left to right)
- **Y-axis**: Vertical position (top to bottom)
- **Units**: Pixels (automatically scaled to template dimensions)

### Recommended Field Positions

#### **Name Field**
```yaml
- key: "name"
  x: 300          # Horizontal position
  y: 200          # Vertical position
  font_size: 24   # Base font size
  width: 400      # Maximum text width
```

#### **Email Field**
```yaml
- key: "email"
  x: 300          # Same X as name for alignment
  y: 250          # Below name field
  font_size: 18   # Smaller than name
  width: 400      # Same width as name
```

#### **Custom Fields**
```yaml
- key: "organization"
  x: 300          # Aligned with other fields
  y: 300          # Below email
  font_size: 20   # Medium size
  width: 400      # Consistent width
```

### Coordinate Strategies

#### **Fixed Positioning**
```yaml
x: 300    # Fixed pixel value
y: 200    # Fixed pixel value
```
- **Pros**: Precise control over placement
- **Cons**: May need adjustment for different template sizes

#### **Percentage Positioning**
```yaml
x: "50%"  # 50% from left edge
y: "30%"  # 30% from top edge
```
- **Pros**: Automatically adapts to any template size
- **Cons**: Less precise control over exact placement

#### **Hybrid Approach**
```yaml
x: 300    # Fixed X for consistent left alignment
y: "40%"  # Percentage Y for vertical positioning
```
- **Pros**: Best of both worlds
- **Cons**: Requires careful planning

## Testing Your Templates

### 1. Upload Template
Place your PNG file in the `assets/templates/` directory

### 2. Update Event Configuration
In your event's frontmatter, update the template path:
```yaml
---
title: "Your Event Name"
slug: "your-event"
template: "/assets/templates/your-event.png"
# ... other configuration
---
```

### 3. Test Certificate Generation
- Navigate to your event page
- Enter a test email
- Generate a certificate
- Verify text positioning and appearance

### 4. Adjust Field Coordinates
If text appears in wrong positions:
- Modify `x` and `y` values in `participantFields`
- Test again until positioning is correct
- Use browser console to debug positioning issues

## Best Practices

### Design Guidelines
1. **High Contrast**: Ensure text areas have good contrast with background
2. **Clear Typography**: Use readable fonts and appropriate sizes
3. **Consistent Spacing**: Maintain consistent spacing between elements
4. **Professional Appearance**: Keep design clean and business-appropriate
5. **Brand Consistency**: Use consistent colors and styling within each event

### Technical Guidelines
1. **File Optimization**: Compress PNG files without losing quality
2. **Resolution**: Use high-resolution source files (minimum 96 DPI)
3. **File Size**: Keep files under 2MB for optimal performance
4. **Format**: Use PNG for best quality and transparency support
5. **Backup**: Keep original design files for future modifications

### Field Configuration
1. **Logical Order**: Arrange fields in logical reading order
2. **Consistent Alignment**: Align related fields horizontally or vertically
3. **Adequate Spacing**: Leave enough space between fields
4. **Text Wrapping**: Consider long text when setting field widths
5. **Required vs Optional**: Clearly mark which fields are required

## Troubleshooting

### Common Issues

#### **Text Not Appearing**
- Check field coordinates (x, y values)
- Verify field keys match participant data
- Check browser console for errors
- Ensure template image loads correctly

#### **Text Overlap**
- Adjust field coordinates in `participantFields`
- Increase spacing between fields
- Check field heights and widths
- Use percentage-based positioning for better scaling

#### **Wrong Text Positions**
- Verify coordinate system understanding
- Test with simple coordinates first
- Use browser console to check actual positions
- Consider using percentage-based positioning

#### **Template Loading Errors**
- Verify PNG file paths
- Check file permissions
- Ensure PNG files exist in templates directory
- Check browser console for CORS errors

### Debug Tips

1. **Console Logging**: Check browser console for detailed error messages
2. **Coordinate Testing**: Start with simple, centered coordinates
3. **Template Verification**: Ensure template images load correctly
4. **Field Validation**: Verify all required fields have values
5. **Step-by-Step Testing**: Test one field at a time

## Example Templates

### Web Development Workshop
- **Theme**: Modern, tech-focused design
- **Colors**: Blues, grays, professional palette
- **Elements**: Code symbols, web icons, modern typography
- **Fields**: Name, Email, Test field

### Data Science Conference
- **Theme**: Academic, research-focused design
- **Colors**: Deep blues, professional grays
- **Elements**: Data visualization icons, academic symbols
- **Fields**: Name, Email, Organization, Position

### Closed Workshop Example
- **Theme**: Simple, professional design
- **Colors**: Neutral grays, muted tones
- **Elements**: Minimal design, clear typography
- **Fields**: Name, Email, Department

## Future Enhancements

### Planned Features
- **Template Editor**: Visual template customization tool
- **Template Library**: Pre-built template collection
- **Template Validation**: Automatic dimension and quality checking
- **Template Preview**: Live preview of field positioning
- **Template Versioning**: Track template changes over time

### Customization Options
- **Color Schemes**: Multiple color variations per template
- **Layout Variations**: Different layout options for same event
- **Seasonal Themes**: Template variations for different seasons
- **Language Support**: Multi-language template support
- **Accessibility**: High-contrast and screen reader friendly options

## Support and Resources

### Getting Help
- Check browser console for error messages
- Verify template file paths and permissions
- Test with simple field configurations first
- Review this documentation for common solutions

### Additional Resources
- **Design Software**: Photoshop, GIMP, Canva, Figma, Sketch
- **Image Optimization**: TinyPNG, ImageOptim, Squoosh
- **Color Tools**: Adobe Color, Coolors, ColorZilla
- **Typography**: Google Fonts, Adobe Fonts, Font Squirrel

## Conclusion

Creating unique templates for each event allows you to maintain distinct branding while using a consistent certificate generation system. The dynamic dimension handling ensures your certificates look perfect regardless of template size, and the PDF output provides professional, print-ready results.

Take time to design templates that reflect each event's unique identity, and use the coordinate system to position fields precisely. With proper planning and testing, you can create beautiful, professional certificates that enhance your events and provide value to participants.

For questions or support, refer to the main documentation or contact the development team.
