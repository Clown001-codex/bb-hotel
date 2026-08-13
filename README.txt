BB HOTEL — REAL BOOKING SYSTEM

WHAT THIS VERSION ADDS
- Node.js + Express backend
- SQLite database stored in data/bbhotel.db
- Live room availability by date/time
- Inventory per room type
- Guest capacity validation
- Real booking records
- Unique booking references
- Booking status: pending / confirmed / cancelled / completed
- Admin dashboard at /admin
- Contact messages stored in the database
- Optional email notifications with SMTP

SETUP
1. Install Node.js 20 or newer.
2. Open this project folder in VS Code.
3. Open the VS Code terminal.
4. Run: npm install
5. Copy .env.example to .env
6. Change ADMIN_EMAIL, ADMIN_PASSWORD and SESSION_SECRET in .env
7. Run: npm start
8. Open: http://localhost:3000
9. Admin: http://localhost:3000/admin

IMPORTANT
The booking system needs the Node/Express backend running. Recommended: run npm install, then npm start, then open http://localhost:3000.

You can also preview the frontend with Live Server (for example port 5500) as long as the backend is ALSO running on http://localhost:3000. The booking script automatically routes API calls to port 3000 in that case. If you see 'Unexpected token <, <!DOCTYPE ... is not valid JSON', you are viewing the page without the backend/API and should start the server with npm start.

EMAIL NOTIFICATIONS
The booking system already stores every reservation in SQLite. To receive an email whenever a booking is made, fill in the SMTP_* values and NOTIFICATION_EMAIL in .env.

PRODUCTION
Before putting this online, use HTTPS, a strong SESSION_SECRET, a real persistent session store, production SMTP credentials/app passwords, backups, database hosting/storage, rate limiting, and a proper admin password policy.


CONFIGURED CONTACT DETAILS
Phone: +234 808 263 6966
Email: macaulayolalekan@gmail.com

GMAIL SMTP
The project includes a .env file configured for Gmail SMTP. Keep the .env file private and never commit it to GitHub. For production, replace the admin/session secrets and use a Gmail App Password with 2-Step Verification enabled.
