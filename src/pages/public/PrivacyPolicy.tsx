import { PublicHeader } from "@/components/PublicHeader";
import Footer from "@/components/Footer";

const PrivacyPolicy = () => {
  return (
    <div className="min-h-screen bg-background">
      <PublicHeader />
      <main className="mx-auto max-w-3xl px-4 pb-16 pt-8 sm:pt-10">
        <h1 className="mb-6 text-2xl font-extrabold sm:text-3xl">Privacy Policy & Cookie Notice</h1>
        <p className="mb-6 text-sm text-muted-foreground">সর্বশেষ আপডেট: {new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}</p>

        <section className="mb-8 space-y-3">
          <h2 className="text-lg font-bold">আমরা কী তথ্য সংগ্রহ করি</h2>
          <p className="text-sm leading-relaxed text-muted-foreground">
            MediHour ব্যবহারের সময় আমরা আপনার নাম, ইমেইল, ফোন নম্বর, শিক্ষাগত তথ্য, এবং
            আপনি কীভাবে ওয়েবসাইট ব্যবহার করছেন (কোন পেজ দেখেছেন, কোন কোর্সে আগ্রহী, পেমেন্ট
            সংক্রান্ত তথ্য) সংগ্রহ করি — শুধুমাত্র সেবা প্রদান, অ্যাকাউন্ট পরিচালনা, এবং
            আমাদের বিজ্ঞাপন কার্যকারিতা যাচাইয়ের জন্য।
          </p>
        </section>

        <section className="mb-8 space-y-3">
          <h2 className="text-lg font-bold">কুকি ও ট্র্যাকিং প্রযুক্তি</h2>
          <p className="text-sm leading-relaxed text-muted-foreground">
            আমরা আমাদের ওয়েবসাইটে <strong>Meta (Facebook/Instagram) Pixel</strong> এবং{" "}
            <strong>Conversions API</strong> ব্যবহার করি, যা আমাদের বিজ্ঞাপন কতটা কার্যকর
            তা বুঝতে সাহায্য করে। এই প্রযুক্তি নিম্নলিখিত কার্যক্রম ট্র্যাক করতে পারে:
          </p>
          <ul className="list-inside list-disc space-y-1 text-sm text-muted-foreground">
            <li>ওয়েবসাইট ভিজিট (PageView)</li>
            <li>কোর্স পেজ দেখা (ViewContent)</li>
            <li>অ্যাকাউন্ট রেজিস্ট্রেশন (CompleteRegistration)</li>
            <li>পেমেন্ট/এনরোলমেন্ট প্রক্রিয়া শুরু করা (InitiateCheckout)</li>
            <li>সফল পেমেন্ট (Purchase) — শুধুমাত্র ভেরিফাইড পেমেন্টের পরে</li>
          </ul>
          <p className="text-sm leading-relaxed text-muted-foreground">
            এই তথ্যের কিছু অংশ (যেমন ইমেইল, ফোন নম্বর) নিরাপত্তার জন্য এনক্রিপ্ট (hashed)
            করে Meta-কে পাঠানো হয়, যাতে সরাসরি ব্যক্তিগত তথ্য প্রকাশ না হয়। এই তথ্য শুধুমাত্র
            বিজ্ঞাপন অপ্টিমাইজেশন এবং রিটার্গেটিং-এর জন্য ব্যবহৃত হয়।
          </p>
        </section>

        <section className="mb-8 space-y-3">
          <h2 className="text-lg font-bold">রিটার্গেটিং ও কাস্টম অডিয়েন্স</h2>
          <p className="text-sm leading-relaxed text-muted-foreground">
            আমরা Facebook/Instagram-এ বিজ্ঞাপনের মাধ্যমে আগের ভিজিটরদের কাছে পুনরায় পৌঁছানোর
            (retargeting) জন্য এই ডেটা ব্যবহার করতে পারি — যেমন যারা কোনো কোর্স পেজ দেখেছেন
            কিন্তু কেনেননি, তাদের কাছে সংশ্লিষ্ট বিজ্ঞাপন দেখানো।
          </p>
        </section>

        <section className="mb-8 space-y-3">
          <h2 className="text-lg font-bold">আপনার নিয়ন্ত্রণ</h2>
          <p className="text-sm leading-relaxed text-muted-foreground">
            আপনি চাইলে আপনার ব্রাউজার সেটিংস থেকে কুকি ব্লক বা ডিলিট করতে পারেন, অথবা Facebook-এর{" "}
            <a
              href="https://www.facebook.com/ads/preferences"
              target="_blank"
              rel="noreferrer"
              className="text-primary underline"
            >
              Ad Preferences
            </a>{" "}
            পেজ থেকে বিজ্ঞাপন-সম্পর্কিত পছন্দ নিয়ন্ত্রণ করতে পারেন।
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-bold">যোগাযোগ</h2>
          <p className="text-sm leading-relaxed text-muted-foreground">
            এই নীতিমালা সম্পর্কে কোনো প্রশ্ন থাকলে medihourofficial@gmail.com-এ যোগাযোগ করুন।
          </p>
        </section>
      </main>
      <Footer />
    </div>
  );
};

export default PrivacyPolicy;
