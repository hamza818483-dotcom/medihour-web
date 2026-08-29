import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getGuestInfo, setGuestInfo, GuestExamInfo } from "@/lib/guestExamInfo";

interface GuestExamInfoDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (info: GuestExamInfo) => void;
}

export default function GuestExamInfoDialog({ open, onOpenChange, onConfirm }: GuestExamInfoDialogProps) {
  const existing = getGuestInfo();
  const [name, setName] = useState(existing?.name || "");
  const [hscBatch, setHscBatch] = useState(existing?.hscBatch || "2026");
  const [collegeName, setCollegeName] = useState(existing?.collegeName || "");
  const [phone, setPhone] = useState(existing?.phone || "");
  const [error, setError] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !collegeName.trim() || !phone.trim()) {
      setError("সবগুলো তথ্য দিতে হবে");
      return;
    }
    if (!/^\d{10,15}$/.test(phone.trim().replace(/^\+?880/, "0"))) {
      setError("সঠিক ফোন নম্বর দাও");
      return;
    }
    const info: GuestExamInfo = {
      name: name.trim(),
      hscBatch,
      collegeName: collegeName.trim(),
      phone: phone.trim(),
    };
    setGuestInfo(info);
    onConfirm(info);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>এক্সাম শুরুর আগে</DialogTitle>
          <DialogDescription>
            লগইন ছাড়াই এক্সাম দিতে পারবে — শুধু নিচের তথ্যগুলো দাও।
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="guest-name">তোমার নাম</Label>
            <Input id="guest-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="পূর্ণ নাম" required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="guest-batch">HSC ব্যাচ</Label>
            <select
              id="guest-batch"
              value={hscBatch}
              onChange={(e) => setHscBatch(e.target.value)}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              <option value="2025">2025</option>
              <option value="2026">2026</option>
              <option value="2027">2027</option>
              <option value="2028">2028</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="guest-college">কলেজের নাম</Label>
            <Input id="guest-college" value={collegeName} onChange={(e) => setCollegeName(e.target.value)} placeholder="তোমার কলেজের পূর্ণ নাম" required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="guest-phone">ফোন নম্বর</Label>
            <Input id="guest-phone" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="01XXXXXXXXX" required />
          </div>
          {error && <p className="text-xs text-destructive font-medium">{error}</p>}
          <DialogFooter className="pt-1">
            <Button type="submit" className="w-full" size="lg">এক্সাম শুরু করো</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
