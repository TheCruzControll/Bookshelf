"use client";

export interface OAuthButtonsProps {
  onApple: () => void;
  onGoogle: () => void;
  disabled?: boolean;
}

export function OAuthButtons({ onApple, onGoogle, disabled }: OAuthButtonsProps) {
  return (
    <div className="authOAuthButtons">
      <button
        type="button"
        className="authOAuthButton"
        onClick={onApple}
        disabled={disabled}
        aria-label="Continue with Apple"
      >
        Continue with Apple
      </button>
      <button
        type="button"
        className="authOAuthButton"
        onClick={onGoogle}
        disabled={disabled}
        aria-label="Continue with Google"
      >
        Continue with Google
      </button>
    </div>
  );
}
