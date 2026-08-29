import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

const GPACalculator = () => {
  const [ssc, setSsc] = useState<string>('');
  const [hsc, setHsc] = useState<string>('');

  const calculateScore = () => {
    const sscVal = parseFloat(ssc);
    const hscVal = parseFloat(hsc);

    if (isNaN(sscVal) || isNaN(hscVal)) return null;

    // Based on user requirements: SSC * 8 + HSC * 12
    const total = (sscVal * 8) + (hscVal * 12);
    return Math.min(total, 100).toFixed(2);
  };

  const score = calculateScore();

  return (
    <Card className="border-border">
      <CardHeader>
        <CardTitle>Medical & Dental GPA Calculator</CardTitle>
        <CardDescription>
          Calculate your GPA marks for Medical and Dental admission exams based on your SSC and HSC results.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="ssc">SSC GPA (out of 5.00)</Label>
            <Input
              id="ssc"
              type="number"
              min="0"
              max="5"
              step="0.01"
              value={ssc}
              onChange={(e) => setSsc(e.target.value)}
              placeholder="e.g. 5.00"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="hsc">HSC GPA (out of 5.00)</Label>
            <Input
              id="hsc"
              type="number"
              min="0"
              max="5"
              step="0.01"
              value={hsc}
              onChange={(e) => setHsc(e.target.value)}
              placeholder="e.g. 5.00"
            />
          </div>
        </div>

        {score !== null && (
          <div className="mt-6 p-4 bg-primary/10 rounded-lg text-center border border-primary/20">
            <h3 className="text-sm font-medium text-muted-foreground mb-1">Your Calculated Score</h3>
            <div className="text-4xl font-bold text-primary">
              {score} <span className="text-lg text-muted-foreground font-normal">/ 100</span>
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              (SSC × 8) + (HSC × 12)
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default GPACalculator;
