import styles from "./chat-preview.module.css";

/**
 * Statische, gestileerde weergave van een intakegesprek, puur decoratief
 * (geen echte widget), bedoeld als productbeeld in de hero en op feature-
 * pagina's. De echte, werkende widget staat op /demo.
 */
export function ChatPreview() {
  return (
    <div
      className={styles.frame}
      role="img"
      aria-label="Voorbeeld van een offertegesprek met de AI-assistent"
    >
      <div className={styles.bar}>
        <span className={styles.dot} />
        <span className={styles.barTitle}>Offerte-assistent</span>
        <span className={styles.live}>● live</span>
      </div>

      <div className={styles.body}>
        <div className={`${styles.msg} ${styles.bot}`}>
          Hoi! Ik help je snel aan een offerte op maat. Waar mag de tuin aangelegd worden?
        </div>
        <div className={`${styles.msg} ${styles.user}`}>In Apeldoorn, achtertuin van ±120 m².</div>
        <div className={`${styles.msg} ${styles.bot}`}>
          Top. Wat wil je laten doen: bestrating, beplanting, of een complete aanleg?
        </div>
        <div className={`${styles.msg} ${styles.user}`}>Complete aanleg, graag dit najaar.</div>

        <div className={styles.summary}>
          <div className={styles.summaryHead}>
            <span>Samenvatting</span>
            <span className={styles.score}>Leadscore: hoog</span>
          </div>
          <dl className={styles.summaryGrid}>
            <div>
              <dt>Project</dt>
              <dd>Complete tuinaanleg</dd>
            </div>
            <div>
              <dt>Plaats</dt>
              <dd>Apeldoorn · ±120 m²</dd>
            </div>
            <div>
              <dt>Timing</dt>
              <dd>Dit najaar</dd>
            </div>
            <div>
              <dt>Contact</dt>
              <dd>Compleet ✓</dd>
            </div>
          </dl>
        </div>
      </div>
    </div>
  );
}
