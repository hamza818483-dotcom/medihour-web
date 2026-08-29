```
UPDATE auth.users
SET email_confirmed_at = NOW()
WHERE email = 'user@example.com';
```


# Atlass

**Atlas** is a modern, commercial-grade Learning Management System (LMS) designed for coaching centers and educational institutions in Bangladesh. It features a complete ecosystem for online exams, live classes, resource distribution, and manual payment verification..

## 🚀 Features

### **For Students**
*   **Secure Exams:** Take live and practice exams with real-time timers, rich text support (Math/Science formulas), and instant results.
*   **Live & Past Classes:** Access scheduled live classes (Zoom/YouTube integration) and watch recordings of past sessions.
*   **Resources:** Download lecture notes, PDFs, and view study materials filtered by subject and course.
*   **Performance Analytics:** Track exam history, view leaderboards, and analyze progress.
*   **Manual Payment:** Easy enrollment via bKash/Nagad manual payment submission form.
*   **Anti-Cheat:** Browser tab switch detection and warnings during exams.

### **For Admins**
*   **Dashboard:** Comprehensive overview of students, courses, and platform activity.
*   **Exam Creator:** Powerful editor with support for JSON/CSV bulk import, rich text, and image cropping.
*   **Payment Approval:** Review and approve student payment requests (Transaction IDs) to grant course access.
*   **Content Management:** Manage courses, classes, resources, and announcements.
*   **Multi-Subject Support:** Tag exams and classes with multiple subjects (e.g., Physics, Math).

## 🛠 Tech Stack

*   **Frontend:** [React](https://react.dev/) + [TypeScript](https://www.typescriptlang.org/) + [Vite](https://vitejs.dev/)
*   **Styling:** [Tailwind CSS](https://tailwindcss.com/) + [shadcn/ui](https://ui.shadcn.com/)
*   **Backend & Auth:** [Supabase](https://supabase.com/) (PostgreSQL, Auth, Edge Functions)
*   **State Management:** [TanStack Query](https://tanstack.com/query/latest)
*   **Form Handling:** [React Hook Form](https://react-hook-form.com/) + [Zod](https://zod.dev/)
*   **Rich Text:** [Quill](https://quilljs.com/) + [MathLive](https://cortexjs.io/mathlive/) (for equations)

## 📂 Project Structure

```bash
src/
├── components/         # Reusable UI components (Buttons, Cards, Modals)
│   └── ui/             # shadcn/ui primitives
├── contexts/           # React Contexts (Auth, Notification)
├── hooks/              # Custom hooks (useAntiCheat, useEnrollments)
├── layouts/            # Dashboard and Page layouts
├── lib/                # Utilities, Constants, Date helpers
├── pages/              # Application Pages
│   ├── dashboard/      # Protected Student & Admin Views
│   │   ├── admin/      # Admin-specific pages (Exams, Payments, etc.)
│   │   └── ...         # Student views (LiveClass, TakeExam, etc.)
│   └── ...             # Public pages (Login, Register, Landing)
└── index.css           # Global styles and Tailwind configuration
supabase/
└── migrations/         # SQL migration files for Database Schema
```

## ⚡ Setup Instructions

1.  **Clone the repository:**
    ```bash
    git clone https://github.com/your-username/atlas.git
    cd atlas
    ```

2.  **Install dependencies:**
    ```bash
    npm install
    ```

3.  **Environment Setup:**
    Create a `.env` file in the root directory:
    ```env
    VITE_SUPABASE_URL=your_supabase_project_url
    VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
    ```

4.  **Run Development Server:**
    ```bash
    npm run dev
    ```

## 🗄️ Database Schema (Key Tables)

*   **`profiles`**: Stores user details (Registration ID, Phone, Role).
*   **`courses`**: Available courses with pricing and details.
*   **`enrollments`**: Links students to courses they have purchased.
*   **`exams`**: Exam configuration (Duration, Negative Marking, Type).
*   **`exam_questions`**: Questions for each exam (MCQ options, Correct Answer).
*   **`exam_attempts`**: Records student attempts, scores, and violation counts.
*   **`payment_requests`**: Stores manual payment transaction details for Admin approval.
*   **`classes`**: Schedule for Live and Recorded classes.

## 🔒 Security Features

*   **Server-Side Scoring:** Exam scores are calculated via a PostgreSQL RPC function (`submit_exam_attempt`), preventing client-side score manipulation.
*   **Row Level Security (RLS):** Strict database policies ensure students can only access their own data and enrolled content.
*   **Anti-Cheat:** Frontend hooks detect tab switching and report violations to the server.

## 📝 TODO / Future Improvements

### 🛑 Anti-Piracy & Video Protection
To prevent unauthorized distribution of your paid content:
1.  **Signed URLs:** Store videos in private Supabase Storage buckets. Generate short-lived (e.g., 1 hour) signed URLs for playback. This prevents direct link sharing.
2.  **DRM Integration:** For "Hollywood-grade" protection, integrate services like **VdoCipher** or **Bunny.net Stream**. They use DRM (Digital Rights Management) to block download managers and screen recording extensions.
3.  **Dynamic Watermarking:** Overlay the student's Registration ID and Phone Number on the video player. If a video leaks, you can identify the source immediately.
4.  **Device Limits:** Implement logic to restrict login sessions to 1 active device at a time.

### 💳 Automated Payments
*   Integrate a Payment Gateway API (SurjoPay, Aamarpay, or bKash Merchant API) to automate the `payment_requests` workflow, allowing instant enrollment upon successful payment.

### 📱 Mobile App
*   Wrap the existing React web app using **Capacitor** to deploy as a native Android/iOS app.
*   Or port key features to **React Native** for a better mobile performance.

---
*Built with ❤️ for education in Bangladesh.*
