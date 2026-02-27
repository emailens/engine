/**
 * JSX (React Email) framework-specific suggestion strings.
 * All keys have a ::jsx suffix in the original SUGGESTION_DATABASE.
 */
export const JSX_SUGGESTION_DATABASE: Record<string, string> = {
  // ── <style> ───────────────────────────────────────────────────────────
  "<style>::jsx":
    "Move styles to inline style props — React Email components accept style objects directly.",
  "<style>:partial::jsx":
    "Use inline style props on React Email components. Reserve <style> in <Head> for progressive enhancement only.",

  // ── <link> ────────────────────────────────────────────────────────────
  "<link>::jsx":
    "Use the React Email <Head> component for font imports; place all other styles inline via style props.",

  // ── <svg> ─────────────────────────────────────────────────────────────
  "<svg>::jsx":
    "Replace inline SVG with the React Email <Img> component pointing to a hosted PNG.",

  // ── <video> ───────────────────────────────────────────────────────────
  "<video>::jsx":
    "Replace <video> with a React Email <Link> wrapping an <Img> thumbnail.",

  // ── <form> ────────────────────────────────────────────────────────────
  "<form>::jsx":
    "Replace the form with a React Email <Button> or <Link> component pointing to a hosted form page.",

  // ── @font-face ────────────────────────────────────────────────────────
  "@font-face::jsx":
    "Use the React Email <Font> component in <Head> with a fallbackFontFamily prop.",

  // ── @media ────────────────────────────────────────────────────────────
  "@media::jsx":
    "Use a single-column layout with React Email <Container> and <Section>. Avoid relying on @media queries.",

  // ── display:flex ──────────────────────────────────────────────────────
  "display:flex::jsx":
    "Use React Email <Row> and <Column> components instead of flexbox.",

  // ── display:grid ──────────────────────────────────────────────────────
  "display:grid::jsx":
    "Use React Email <Row> and <Column> components instead of CSS Grid.",

  // ── linear-gradient ───────────────────────────────────────────────────
  "linear-gradient::jsx":
    "Add a solid backgroundColor style prop as fallback before the gradient.",

  // ── box-shadow ────────────────────────────────────────────────────────
  "box-shadow::jsx":
    "Use a border style prop as an alternative to boxShadow.",

  // ── border-radius ─────────────────────────────────────────────────────
  "border-radius::jsx":
    "Outlook ignores borderRadius. Use dangerouslySetInnerHTML with VML for rounded buttons if needed.",

  // ── max-width ─────────────────────────────────────────────────────────
  "max-width::jsx":
    "Use the React Email <Container> component which handles max-width across clients.",

  // ── gap ───────────────────────────────────────────────────────────────
  "gap::jsx":
    "Use padding style props on <Column> components instead of gap.",

  // ── float ─────────────────────────────────────────────────────────────
  "float::jsx":
    "Use React Email <Row> and <Column> components for side-by-side layout.",

  // ── background-image ──────────────────────────────────────────────────
  "background-image::jsx":
    "Use VML via dangerouslySetInnerHTML for Outlook background images.",

  // ── position ──────────────────────────────────────────────────────────
  "position::jsx":
    "Use React Email <Row> and <Column> components for positioning.",

  // ── opacity ───────────────────────────────────────────────────────────
  "opacity::jsx":
    "Use solid colors. Opacity is not supported in many email clients.",

  // ── word-break ────────────────────────────────────────────────────────
  "word-break::jsx":
    "Wrap long text in a <table><tr><td> element. Outlook ignores wordBreak but respects table cell widths.",

  // ── overflow-wrap ─────────────────────────────────────────────────────
  "overflow-wrap::jsx":
    "Wrap text in a <table><tr><td> element. Outlook ignores overflowWrap but respects table cell widths.",
};
