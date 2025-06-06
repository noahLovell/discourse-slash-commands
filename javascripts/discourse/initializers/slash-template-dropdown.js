import { withPluginApi } from "discourse/lib/plugin-api";

export default {
  name: "slash-template-dropdown",

  initialize() {
    withPluginApi("0.8.7", (api) => {
      // ────────────────────────────────────────────────────────────────────────────
      // 1. CARET POSITION HELPER
      //    Mirrors the textarea’s CSS in a hidden <div> to find the caret’s pixel coords.
      // ────────────────────────────────────────────────────────────────────────────
      function getCaretCoordinates(el, position) {
        const div = document.createElement("div");
        const style = getComputedStyle(el);
        const properties = [
          "boxSizing", "width", "height", "overflowX", "overflowY",
          "borderTopWidth", "borderRightWidth", "borderBottomWidth", "borderLeftWidth",
          "paddingTop", "paddingRight", "paddingBottom", "paddingLeft",
          "fontStyle", "fontVariant", "fontWeight", "fontStretch", "fontSize", "fontSizeAdjust",
          "lineHeight", "fontFamily", "textAlign", "textTransform", "textIndent",
          "textDecoration", "letterSpacing", "wordSpacing"
        ];
        properties.forEach((prop) => {
          div.style[prop] = style[prop];
        });
        div.style.position = "absolute";
        div.style.visibility = "hidden";
        div.style.whiteSpace = "pre-wrap";
        div.style.wordWrap = "break-word";

        // Put text up to the caret into the mirror <div>
        div.textContent = el.value.substring(0, position);

        // Create a <span> just after the caret so we can measure it
        const span = document.createElement("span");
        span.textContent = el.value.substring(position) || ".";
        div.appendChild(span);

        document.body.appendChild(div);
        const coordinates = {
          top:  span.offsetTop  + parseInt(style["borderTopWidth"], 10),
          left: span.offsetLeft + parseInt(style["borderLeftWidth"], 10)
        };
        document.body.removeChild(div);
        return coordinates;
      }

      // ────────────────────────────────────────────────────────────────────────────
      // 2. SHOW DROPDOWN
      //    − Removes any existing dropdown
      //    − Positions it at the caret
      //    − Populates items with keyboard (↑/↓/Enter/Esc) navigation
      // ────────────────────────────────────────────────────────────────────────────
      function showDropdown(textarea, parsedTemplates) {
        // (a) Remove any existing dropdown
        const existing = document.getElementById("my-template-dropdown");
        if (existing) {
          existing.remove();
        }

        // (b) Create the dropdown container
        const dropdown = document.createElement("div");
        dropdown.id = "my-template-dropdown";
        dropdown.style.position = "absolute";
        dropdown.style.background = "#fff";
        dropdown.style.border = "1px solid #ccc";
        dropdown.style.zIndex = 10000;
        dropdown.style.minWidth = "150px";
        dropdown.style.boxShadow = "0 2px 6px rgba(0,0,0,0.2)";

        // (c) Compute caret‐pixel coordinates
        const caretPos   = textarea.selectionStart;
        const coords     = getCaretCoordinates(textarea, caretPos);
        const taRect     = textarea.getBoundingClientRect();
        const lineHeight = parseInt(getComputedStyle(textarea).lineHeight, 10) || 16;

        dropdown.style.left = `${taRect.left + window.scrollX + coords.left}px`;
        dropdown.style.top  = `${taRect.top  + window.scrollY + coords.top + lineHeight}px`;

        // (d) Build each item from parsedTemplates
        let selectedIndex = 0;
        const items = [];

        parsedTemplates.forEach((t, index) => {
          const item = document.createElement("div");
          item.innerText = t.label;
          item.style.padding = "8px";
          item.style.cursor = "pointer";

          // Highlight the first item initially
          if (index === selectedIndex) {
            item.style.background = "#bde4ff";
          }

          item.onclick = () => {
            // Remove trailing “/template” and insert the chosen snippet
            textarea.value = textarea.value.replace(/\/template\s*$/, "") + t.text;
            cleanup();
            textarea.focus();
          };

          dropdown.appendChild(item);
          items.push(item);
        });

        // (e) updateSelection (clamped—no wrap around)
        function updateSelection(newIndex) {
          items[selectedIndex].style.background = "";
          if (newIndex < 0) {
            newIndex = 0;
          }
          if (newIndex >= items.length) {
            newIndex = items.length - 1;
          }
          selectedIndex = newIndex;
          items[selectedIndex].style.background = "#bde4ff";
        }

        // (f) Keyboard navigation (↑/↓/Enter/Esc)
        function keydownHandler(e) {
          if (!document.getElementById("my-template-dropdown")) return;

          switch (e.key) {
            case "ArrowDown":
              e.preventDefault();
              updateSelection(selectedIndex + 1);
              break;
            case "ArrowUp":
              e.preventDefault();
              updateSelection(selectedIndex - 1);
              break;
            case "Enter":
              e.preventDefault();
              items[selectedIndex].click();
              break;
            case "Escape":
              e.preventDefault();
              cleanup();
              break;
          }
        }

        // (g) Click‐outside to close
        function bodyClickHandler(e) {
          if (!dropdown.contains(e.target)) {
            cleanup();
          }
        }

        // (h) Cleanup: remove dropdown + unbind listeners
        function cleanup() {
          const d = document.getElementById("my-template-dropdown");
          if (d) d.remove();
          textarea.removeEventListener("keydown", keydownHandler);
          document.body.removeEventListener("click", bodyClickHandler);
        }

        textarea.addEventListener("keydown", keydownHandler);
        document.body.addEventListener("click", bodyClickHandler);
        document.body.appendChild(dropdown);
      }

      // ────────────────────────────────────────────────────────────────────────────
      // 3. HOOK INTO THE COMPOSER TEXTAREA WHENEVER IT APPEARS
      //    We poll for “.d-editor-input” then listen for “/template” at line-end.
      // ────────────────────────────────────────────────────────────────────────────
      document.addEventListener("DOMContentLoaded", () => {
        const observer = new MutationObserver(() => {
          const textarea = document.querySelector(".d-editor-input");
          if (textarea && !textarea.__slashTemplateHooked) {
            textarea.__slashTemplateHooked = true;

            textarea.addEventListener("keyup", (e) => {
              // Ignore navigation keys so we don’t re‐open/reset the dropdown
              if (["ArrowDown", "ArrowUp", "Enter", "Escape"].includes(e.key)) {
                return;
              }

              const val = textarea.value;
              if (/\/template\s*$/.test(val)) {
                // === Fetch the “templates” block from theme settings ===
                const raw = api.getSettings().templates || "[]";
                let parsedTemplates = [];

                try {
                  parsedTemplates = JSON.parse(raw);
                } catch (err) {
                  // If JSON parsing fails, fallback to empty array
                  parsedTemplates = [];
                }

                if (Array.isArray(parsedTemplates) && parsedTemplates.length) {
                  showDropdown(textarea, parsedTemplates);
                }
              }
            });
          }
        });

        observer.observe(document.body, { childList: true, subtree: true });
      });
    });
  },
};
