"use client";

import { useState } from "react";
import { Moon, Star, Zap, FileText } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import type { SleepCheckin } from "@/lib/types";

interface SleepCheckinCardProps {
  value: SleepCheckin;
  onChange: (v: SleepCheckin) => void;
  disabled?: boolean;
}

function RatingSelector({
  label,
  value,
  onChange,
  options,
  disabled,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  options: { value: number; label: string; color: string }[];
  disabled?: boolean;
}) {
  return (
    <div className="space-y-2">
      <Label className="text-xs text-muted-foreground uppercase tracking-wide">
        {label}
      </Label>
      <div className="flex gap-1.5">
        {options.map((opt) => (
          <button
            key={opt.value}
            type="button"
            disabled={disabled}
            onClick={() => onChange(opt.value)}
            title={opt.label}
            className={`flex-1 rounded-md border py-2 text-xs font-medium transition-all ${
              value === opt.value
                ? `${opt.color} border-current opacity-100`
                : "border-border bg-muted text-muted-foreground opacity-60 hover:opacity-80"
            } disabled:cursor-not-allowed disabled:opacity-40`}
          >
            {opt.value}
          </button>
        ))}
      </div>
      <p className="text-[11px] text-muted-foreground">
        {options.find((o) => o.value === value)?.label ?? ""}
      </p>
    </div>
  );
}

export function SleepCheckinCard({
  value,
  onChange,
  disabled,
}: SleepCheckinCardProps) {
  const qualityOptions = [
    { value: 1, label: "Péssima", color: "text-red-400" },
    { value: 2, label: "Ruim", color: "text-orange-400" },
    { value: 3, label: "Regular", color: "text-yellow-400" },
    { value: 4, label: "Boa", color: "text-lime-400" },
    { value: 5, label: "Ótima", color: "text-emerald-400" },
  ];

  const fatigueOptions = [
    { value: 1, label: "Descansado", color: "text-emerald-400" },
    { value: 2, label: "Leve cansaço", color: "text-lime-400" },
    { value: 3, label: "Cansado", color: "text-yellow-400" },
    { value: 4, label: "Muito cansado", color: "text-orange-400" },
    { value: 5, label: "Exausto", color: "text-red-400" },
  ];

  return (
    <Card className="border-0 bg-transparent shadow-none">
      <CardContent className="space-y-6 px-0 pb-0 pt-2">
        {/* Horas dormidas */}
        <div className="space-y-2">
          <Label
            htmlFor="sleep-hours"
            className="flex items-center gap-1.5 text-xs text-muted-foreground uppercase tracking-wide"
          >
            <Moon className="h-3 w-3" />
            Horas Dormidas
          </Label>
          <div className="flex items-center gap-3">
            <Input
              id="sleep-hours"
              type="number"
              min={0}
              max={14}
              step={0.5}
              value={value.total_sleep_hours}
              disabled={disabled}
              onChange={(e) =>
                onChange({
                  ...value,
                  total_sleep_hours: parseFloat(e.target.value) || 0,
                })
              }
              className="w-24 text-center text-lg font-bold"
            />
            <div className="flex-1">
              <div className="h-2 w-full overflow-hidden rounded-full bg-zinc-800">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${
                    value.total_sleep_hours < 6
                      ? "bg-rose-500"
                      : value.total_sleep_hours < 7
                      ? "bg-amber-500"
                      : value.total_sleep_hours <= 9
                      ? "bg-emerald-500"
                      : value.total_sleep_hours <= 10
                      ? "bg-sky-400"
                      : "bg-amber-500"
                  }`}
                  style={{
                    width: `${Math.min((value.total_sleep_hours / 12) * 100, 100)}%`,
                  }}
                />
              </div>
              <p className="mt-1 text-[11px] text-muted-foreground font-medium">
                {value.total_sleep_hours < 6
                  ? "Privação de sono"
                  : value.total_sleep_hours < 7
                  ? "Abaixo do ideal"
                  : value.total_sleep_hours <= 9
                  ? "Sono adequado / Ideal"
                  : value.total_sleep_hours <= 10
                  ? "Sono prolongado"
                  : "Excesso / Possível inércia"}
              </p>
            </div>
          </div>
        </div>

        {/* Qualidade do sono */}
        <RatingSelector
          label="Qualidade do Sono"
          value={value.subjective_quality_1_to_5}
          onChange={(v) => onChange({ ...value, subjective_quality_1_to_5: v })}
          options={qualityOptions}
          disabled={disabled}
        />

        {/* Fadiga percebida */}
        <RatingSelector
          label="Fadiga ao Acordar"
          value={value.subjective_fatigue_1_to_5}
          onChange={(v) => onChange({ ...value, subjective_fatigue_1_to_5: v })}
          options={fatigueOptions}
          disabled={disabled}
        />

        {/* Notas opcionais */}
        <div className="space-y-2">
          <Label
            htmlFor="sleep-notes"
            className="flex items-center gap-1.5 text-xs text-muted-foreground uppercase tracking-wide"
          >
            <FileText className="h-3 w-3" />
            Notas (opcional)
          </Label>
          <textarea
            id="sleep-notes"
            rows={2}
            disabled={disabled}
            placeholder="Ex: acordei várias vezes, sonho agitado..."
            value={value.notes ?? ""}
            onChange={(e) => onChange({ ...value, notes: e.target.value })}
            className="flex w-full rounded-lg border border-input bg-muted px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 resize-none"
          />
        </div>
      </CardContent>
    </Card>
  );
}
