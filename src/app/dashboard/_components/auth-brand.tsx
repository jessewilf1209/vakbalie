import s from "../dashboard.module.css";

export function AuthBrand() {
  return (
    <div className={s.authBrand}>
      <span className={s.authBrandMark} aria-hidden="true">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path
            d="M12 3C7 3 3 7.5 3 13c0 4 2.5 7 6 8.5V18c-2-1-3-3-3-5 0-3.5 2.7-7 6-7 3.3 0 6 3.5 6 7 0 2-1 4-3 5v3.5C18.5 20 21 17 21 13c0-5.5-4-10-9-10z"
            fill="currentColor"
          />
        </svg>
      </span>
      <span className={s.authBrandNaam}>Vakbalie</span>
    </div>
  );
}
