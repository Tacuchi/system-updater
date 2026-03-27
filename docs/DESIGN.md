```markdown
# Design System Specification: The Kinetic Console

## 1. Overview & Creative North Star
### Creative North Star: "The Neon Brutalist"
This design system rejects the "web-mimicking" aesthetics of modern interfaces in favor of a sophisticated, high-fidelity reimagining of the Command Line Interface (CLI). It is built for power users who demand efficiency but crave an editorial, premium experience. 

We move beyond the "standard" TUI by blending the raw, structural honesty of Unicode box-drawing with the lush, vibrant depth of modern glassmorphism. The layout is intentionally asymmetric, prioritizing data-density while using expansive "negative space" to create a sense of focused calm. It is a system where every character is intentional, and every pixel serves the flow of information.

---

## 2. Colors & Surface Logic
The palette is a high-contrast dialogue between deep, ink-like voids and hyper-saturated signals.

### The "No-Line" Rule
Traditional 1px solid CSS borders are strictly prohibited. Sectioning must be achieved through:
1.  **Tonal Shifts:** Moving between `surface-container-low` (#1c1b1b) and `surface-container-high` (#2a2a2a).
2.  **Unicode Architecture:** Using specific characters (e.g., `┌`, `─`, `┐`) in `outline-variant` (#484556) at 20% opacity.

### Surface Hierarchy & Nesting
Treat the interface as a physical stack of acrylic sheets.
*   **Base:** `surface` (#131313) is the infinite void.
*   **Primary Containers:** `surface-container` (#201f1f) for main work areas.
*   **Floating Intelligence:** `surface-container-highest` (#353534) for modals or pop-overs, utilizing a 12px `backdrop-blur` to simulate depth.

### Signature Textures
Apply a subtle linear gradient to main CTAs (e.g., `primary` #c9bfff to `primary-container` #6a49f8) at a 135-degree angle. This provides a "glow" effect reminiscent of phosphor monitors without looking dated.

---

## 3. Typography: Editorial Monospace
The hierarchy balances the brutalist nature of `JetBrains Mono` with the sophisticated weight of `Mori Variable`.

*   **Display & Headlines:** Use `spaceGrotesk`. Set `display-lg` (3.5rem) with a negative letter-spacing (-0.05em) to create an authoritative, "pressed-ink" feel.
*   **The Mono-Signal:** All functional data, code, and status indicators must use `JetBrains Mono`. 
*   **Body & Titles:** Use `inter` for high-readability documentation. The juxtaposition of a high-end sans-serif against a technical monospace font creates the "Editorial TUI" signature.

---

## 4. Elevation & Depth
In this system, elevation is a product of light (color) and blur, not geometry.

*   **Tonal Layering:** To highlight a specific module, do not use a shadow. Instead, drop the background of the surrounding area to `surface-container-lowest` (#0e0e0e) and keep the active module at `surface-container-low` (#1c1b1b).
*   **The "Ghost Border":** For necessary containment, use the `outline-variant` (#484556) token. Apply it as an inner shadow or a stroke with 15% opacity. It should feel like a faint reflection on the edge of a screen.
*   **Ambient Shadows:** For floating command palettes, use a shadow color derived from `on-surface` (#e5e2e1) at 6% opacity, with a 64px blur and 32px spread. It shouldn't look like a shadow; it should look like the UI is "lifting" off the hardware.

---

## 5. Components

### Buttons: The "Block" Variant
Buttons should feel like physical terminal keys.
*   **Primary:** Background `primary-container` (#6a49f8), text `on-primary-container` (#f0e9ff). No rounded corners (use `none` 0px).
*   **Secondary:** Background `surface-container-highest`, text `primary`. 
*   **Interactions:** On hover, shift background to `tertiary` (#31e368) for a high-energy feedback loop.

### Progress Bars: The "Vibrant Gauge"
*   **Track:** `surface-container-highest` (#353534).
*   **Indicator:** A solid block of `secondary` (#ffade0) or `tertiary` (#31e368).
*   **Styling:** Use a 2px height for subtle tracking, or 12px height with "Unicode Segments" (e.g., `█`) for a bold, tech-focused look.

### Input Fields: The "Prompt"
*   **Styling:** No background. Only a `surface-variant` bottom border (the Ghost Border).
*   **Active State:** The bottom border transforms into a 2px `primary` line. Use a "Block Cursor" (a blinking `primary` rectangle) to indicate focus.

### Cards & Lists: The "Whitespace Divider"
*   **Constraint:** Zero dividers. 
*   **Execution:** Separate list items using `spacing-4` (1rem). Group related items within a `surface-container-low` block. Use `tertiary` (#31e368) "bullets" (e.g., `>`) to denote selection rather than a background change.

### Status Indicators: "The Lip Gloss Effect"
Use high-contrast pills for status.
*   **Error:** `error_container` background with `on_error_container` text.
*   **Success:** `tertiary_container` background with `on_tertiary_container` text.
*   **Shape:** Use `full` (9999px) roundedness to contrast against the otherwise boxy, monospace environment.

---

## 6. Do’s and Don’ts

### Do
*   **Do** use Unicode box-drawing characters (`┌───┐`) to frame high-level dashboard summaries.
*   **Do** lean into asymmetry. If a list is on the left, let the right side have massive "air" (empty `surface` space).
*   **Do** use `tertiary` (#31e368) sparingly as a "success" or "active" signal. It is your most powerful visual tool.

### Don’t
*   **Don’t** use standard "Web 2.0" rounded cards. Stick to `sm` (0.125rem) or `none` (0px) for a sharper, more technical edge.
*   **Don’t** use pure black (#000000). Use `surface` (#131313) to maintain tonal depth and prevent "smearing" on OLED screens.
*   **Don’t** stack more than three levels of surface containers. If you need more depth, use a color accent (like a `primary` glow) instead of a new grey.

---

## 7. Signature Layout Patterns
### The "Command Center" Header
Combine `display-sm` typography with a `label-sm` monospace timestamp. Underline the entire header with a single `outline-variant` line at 10% opacity. This creates an editorial "Masthead" feel for a technical application.

### The "Diagnostic" Sidebar
Use `surface-container-lowest` for a sidebar that feels "recessed" into the screen. Populated with `JetBrains Mono` at `body-sm` size, it serves as a high-density stream of metadata or logs.