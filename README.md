# Multi-Event Certificate Generator

A Jekyll-based static website with **Firebase** handling authentication and participant data storage. Certificates are generated dynamically based on event-specific templates and participant data.

## 🚀 Features

- **Event Management**: Create and manage events via admin panel
- **Participant Management**: Upload and manage participant lists via CSV or manual entry
- **Certificate Generation**: Auto-generate certificates with participant data
- **Admin Authentication**: Gmail-based Firebase authentication for admins only
- **Public Access**: Participants can retrieve certificates without logging in
- **Responsive Design**: Modern, mobile-friendly interface

## 🛠️ Tech Stack

- **Jekyll**: Static site generator

- **Firebase**: Authentication and Firestore database (no storage needed)
- **Bootstrap 5**: UI framework
- **Font Awesome**: Icons

## 📋 Prerequisites

- Ruby 2.6.5 or higher
- Bundler

- Firebase project

## 🔧 Setup Instructions

### 1. Clone the Repository

```bash
git clone <repository-url>
cd certdevnew
```

### 2. Install Dependencies

```bash
# Install Ruby gems
bundle install

# Install Node.js dependencies (if needed)
npm install
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

Update the admin emails in `assets/js/auth.js`:

```javascript
this.adminEmails = [
    'your-admin-email@gmail.com',
    // Add more admin emails here
];
```

### 5. Run the Development Server

```bash
bundle exec jekyll serve
```

The site will be available at `http://localhost:4000`

## 📁 Project Structure

```
certdevnew/
├── _events/                 # Event markdown files
├── _layouts/               # Jekyll layouts
├── _includes/              # Jekyll includes
├── assets/
│   ├── css/               # Stylesheets
│   ├── js/                # JavaScript files
│   ├── images/            # Images
│   └── templates/         # Certificate templates
├── admin/                 # Admin dashboard
├── _config.yml           # Jekyll configuration
├── Gemfile               # Ruby dependencies
└── README.md             # This file
```

## 🎯 Usage

### For Admins

1. **Access Admin Panel**: Navigate to `/admin/` and login with Gmail
2. **Manage Events**: Use the admin panel to create/edit events
3. **Upload Participants**: Use the admin panel to upload CSV files or add participants manually
4. **Monitor Analytics**: View download statistics and event performance

### For Participants

1. **Browse Events**: Visit the main page to see available events
2. **Find Certificate**: Click on an event and enter your email
3. **Download Certificate**: If found, download your personalized certificate

## 🔐 Security

- **Admin Authentication**: Only authorized Gmail accounts can access admin features
- **Public Access**: Participants can retrieve certificates without authentication
- **Firestore Rules**: Configured to allow public read access for certificate retrieval

## 📊 Data Model

### Events (Admin Panel)
```yaml
title: "Event Title"
slug: "event-slug"
description: "Event description"
status: "published" # draft | published | archived
date: "2024-01-15"
template: "/assets/templates/event-template.png"
firestore_collection: "event_participants"
fields:
  - key: "name"
    label: "Full Name"
    required: true
    x: 300
    y: 200
    font_size: 24
```

### Participants (Firestore)
```json
{
  "email": "participant@example.com",
  "name": "John Doe",
  "certificateDownloaded": false,
  "downloadedAt": null
}
```

### Certificate Metadata (Firestore)
```json
{
  "eventSlug": "web-dev-workshop",
  "participantId": "participant_id",
  "generatedAt": "timestamp",
  "status": "generated",
  "hasCertificate": true
}
```

## 🚀 Deployment

### Netlify (Recommended)

1. Connect your repository to Netlify
2. Set build command: `bundle exec jekyll build`
3. Set publish directory: `_site`
4. Configure environment variables for Firebase

### GitHub Pages

1. Push to GitHub
2. Enable GitHub Pages in repository settings
3. Set source to main branch

## 🔧 Configuration

### Jekyll Configuration

Edit `_config.yml` to customize:
- Site title and description
- URL and base URL
- Collections and pagination


### Firebase Configuration

Update Firestore security rules to allow:
- Public read access for certificate retrieval
- Admin write access for participant management

### Certificate Templates

Templates are stored locally in `assets/templates/` and can be managed via:
- Git repository (direct file upload)


## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

## 📝 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🆘 Support

For support and questions:
- Create an issue in the repository
- Check the documentation
- Review Firebase and Jekyll documentation

## 🔄 Updates and Maintenance

- Regularly update dependencies
- Monitor Firebase usage and costs
- Backup Firestore data regularly
- Test certificate generation functionality

## 📈 Future Enhancements

- [ ] PDF certificate templates
- [ ] Visual field placement editor
- [ ] Certificate versioning
- [ ] Automated participant syncing
- [ ] Advanced analytics
- [ ] Email notifications
- [ ] Bulk certificate generation
- [ ] Custom certificate designs
