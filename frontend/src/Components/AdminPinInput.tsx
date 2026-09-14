import React, { useState } from "react";

type AdminPinInputProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, "type" | "autoComplete" | "name">;

/**
 * A private, teacher-only PIN field. In Chromium, a visually masked text
 * input avoids password-manager classification while keeping the PIN hidden.
 * Browsers without text-security support fall back to a real password input,
 * which never exposes the entered value.
 */
export default function AdminPinInput(props: AdminPinInputProps) {
  // CRA renders this only in the browser. Resolve support before the first
  // input is created so Chromium never first sees a password-classified field.
  const [supportsTextSecurity] = useState(
    () => Boolean(window.CSS?.supports?.("-webkit-text-security", "disc")),
  );

  return (
    <input
      {...props}
      type={supportsTextSecurity ? "text" : "password"}
      name="teacher-admin-pin"
      autoComplete="off"
      autoCorrect="off"
      spellCheck={false}
      autoCapitalize="off"
      data-lpignore="true"
      data-1p-ignore="true"
      style={supportsTextSecurity ? ({ ...props.style, WebkitTextSecurity: "disc" } as React.CSSProperties) : props.style}
    />
  );
}
