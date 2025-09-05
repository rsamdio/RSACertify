# RSA Certify - Digital Certificate Generation Platform

A comprehensive Jekyll-based static website with **Firebase** integration for digital certificate generation, management, and distribution. Built for **Rotaract South Asia MDIO (RSAMDIO)** to enable Rotaractors to celebrate and showcase their contributions and achievements.

## 🚀 Key Features

### **For Participants**
- **Certificate Retrieval**: Search and download certificates using email addresses or redeem codes
- **Public Access**: No registration required for certificate retrieval
- **Mobile-Friendly**: Responsive design optimized for all devices
- **Secure Downloads**: PDF certificates with proper validation

### **For Administrators**
- **Event Management**: Create and manage multiple events with custom configurations
- **Participant Management**: Bulk upload participants via CSV or manual entry
- **Certificate Generation**: Dynamic PDF generation with customizable templates
- **Admin Authentication**: Secure Google OAuth-based authentication
- **Analytics Dashboard**: Track certificate downloads and participant engagement
- **CSV Import/Export**: Full participant data management with proper quote handling

### **Technical Features**
- **Dynamic Templates**: Customizable certificate templates with field positioning
- **Firebase Integration**: Real-time data synchronization and secure storage
- **Security First**: Comprehensive input validation, rate limiting, and XSS protection
- **SEO Optimized**: Built-in SEO features with structured data
- **Performance Optimized**: Static site generation with CDN-ready assets

## 🛠️ Tech Stack

- **Frontend**: Jekyll (Static Site Generator)
- **Backend**: Firebase (Authentication, Firestore Database)
- **UI Framework**: Bootstrap 5 + Custom CSS
- **Icons**: Font Awesome 6
- **PDF Generation**: jsPDF with Canvas API
- **Security**: Custom SecurityUtils with input validation
- **Deployment**: Netlify with HTTP security headers

## 📋 Prerequisites

- Ruby 2.6.5 or higher
- Bundler
- Firebase project with Firestore enabled
- Google OAuth configured for admin authentication

## 🔧 Setup Instructions

### 1. Clone the Repository

```bash
git clone <repository-url>
cd RSACertify
```

### 2. Install Dependencies

```bash
# Install Ruby gems
bundle install
```

### 3. Firebase Setup

1. Create a Firebase project at [Firebase Console](https://console.firebase.google.com/)
2. Enable Authentication with Google provider
3. Create a Firestore database
4. Update `assets/js/firebase-config.js` with your Firebase configuration:

```javascript
const firebaseConfig = {
    apiKey: "your-api-key-here",
    authDomain: "your-project-id.firebaseapp.com",
    projectId: "your-project-id",
    storageBucket: "your-project-id.appspot.com",
    messagingSenderId: "123456789",
    appId: "your-app-id-here"
};
```

### 4. Configure Admin Access

Update the admin emails in `assets/js/security-utils.js`:

```javascript
static validateAdminEmail(email) {
    const allowedDomains = [
        'rsamdio.org',
        'rotaract.org',
        'rotary.org'
    ];
    // ... validation logic
}
```

### 5. Firestore Security Rules

Configure your Firestore security rules to allow:
- Public read access for certificate retrieval
- Admin write access for participant management
- Proper authentication for admin functions

### 6. Run the Development Server

```bash
bundle exec jekyll serve
```

The site will be available at `http://localhost:4000`

## 📁 Project Structure

```
RSACertify/
├── _events/                 # Event markdown files (Jekyll collection)
├── _layouts/               # Jekyll layouts (default, event)
├── _includes/              # Jekyll includes (footer)
├── assets/
│   ├── css/               # Stylesheets
│   ├── js/                # JavaScript modules
│   │   ├── main.js        # Certificate manager
│   │   ├── firebase-config.js # Firebase setup
│   │   ├── certificate-generator.js # PDF generation
│   │   └── security-utils.js # Security utilities
│   ├── images/            # Static images
│   └── templates/         # Certificate templates (PNG)
├── admin/                 # Admin dashboard (Decap CMS)
│   ├── index.html         # CMS interface
│   ├── config.yml         # CMS configuration
│   └── participants.html  # Participant management
├── _config.yml           # Jekyll configuration
├── netlify.toml          # Netlify deployment config
├── Gemfile               # Ruby dependencies
└── README.md             # This file
```

## 🎯 Usage Guide

### For Administrators

#### 1. **Access Admin Panel**
- Navigate to `/admin/` and login with authorized Google account
- Use Decap CMS interface for content management

#### 2. **Create Events**
- Add new events via the admin interface
- Configure event details, templates, and participant fields
- Set Firestore document ID for data storage

#### 3. **Manage Participants**
- Upload participant lists via CSV (with proper quote handling)
- Manual participant entry with validation
- Export participant data for backup
- Track certificate download status

#### 4. **Monitor Analytics**
- View download statistics
- Track participant engagement
- Monitor system performance

### For Participants

#### 1. **Find Your Certificate**
- Visit the main page to browse available events
- Click on an event to access certificate retrieval
- Enter your email address or redeem code

#### 2. **Download Certificate**
- If found, your personalized certificate will be displayed
- Click download to get a PDF version
- Certificate status is automatically updated

## 🔐 Security Features

### **Input Validation**
- Email and redeem code validation
- XSS prevention with HTML escaping
- SQL injection prevention for Firestore queries
- Rate limiting for search operations

### **Authentication**
- Google OAuth for admin access
- Domain-based admin email validation
- Secure session management

### **Data Protection**
- HTTPS enforcement
- Content Security Policy (CSP)
- X-Frame-Options protection
- Secure HTTP headers via Netlify

## 📊 Data Model

### **Events Collection (Jekyll)**
```yaml
title: "Event Title"
slug: "event-slug"
description: "Event description"
date: "2024-01-15"
status: "active" # active | closed
template: "/assets/templates/event-template.png"
firestore_document_id: "event_doc_id"
participantFields:
  - key: "name"
    label: "Full Name"
    required: true
    x: "20%"
    y: 350
    font_size: 50
    color: "#000000"
```

### **Participants Collection (Firestore)**
```json
{
  "name": "Participant Name",
  "email": "participant@example.com", // or redeem code
  "certificateStatus": "pending", // pending | downloaded
  "downloadedAt": "timestamp",
  "updatedAt": "timestamp",
  "additionalFields": {
    "custom_field": "value"
  }
}
```

## 🚀 Deployment

### **Netlify Deployment**
1. Connect your repository to Netlify
2. Configure build settings:
   - Build command: `bundle exec jekyll build`
   - Publish directory: `_site`
3. Set environment variables for Firebase
4. Deploy with automatic HTTPS and security headers

### **Environment Variables**
```bash
FIREBASE_API_KEY=your_api_key
FIREBASE_AUTH_DOMAIN=your_domain
FIREBASE_PROJECT_ID=your_project_id
```

## 🔧 Configuration

### **Event Configuration**
Each event is configured via Jekyll frontmatter with:
- Event metadata (title, description, date)
- Template configuration
- Participant field definitions
- Firestore integration settings

### **Certificate Templates**
- PNG format templates stored in `/assets/templates/`
- Dynamic field positioning via configuration
- Customizable fonts, colors, and sizing
- Responsive design considerations

## 📈 Performance Optimizations

- **Static Site Generation**: Fast loading with Jekyll
- **CDN Ready**: Optimized assets for global delivery
- **Lazy Loading**: Images and scripts loaded on demand
- **Caching**: Browser and CDN caching strategies
- **Compression**: Gzip compression for all assets

## 🛡️ Security Considerations

- **Input Sanitization**: All user inputs are validated and sanitized
- **Rate Limiting**: Prevents abuse of search functionality
- **CSRF Protection**: Token-based request validation
- **Secure Headers**: Comprehensive HTTP security headers
- **Firebase Rules**: Proper Firestore security rules

## 📞 Support

### **Technical Support**
- **Developer**: ZeoSpec
- **Email**: contact@zeospec.com
- **Website**: https://rtr.zeospec.com/

### **Organization Contact**
- **Organization**: Rotaract South Asia MDIO
- **Contact**: PDRR Arun Teja Godavarthi
- **Email**: rotaract3191drr@gmail.com

## 📄 License

This project is developed for Rotaract South Asia MDIO. All rights reserved.

## 🤝 Contributing

This is a specialized project for RSAMDIO. For contributions or modifications, please contact the development team.

---

**Built with ❤️ for Rotaract South Asia MDIO by ZeoSpec**