import { withPluginApi } from "discourse/lib/plugin-api";

export default {
  name: "slash-template-dropdown",

  initialize(container) {
    withPluginApi("0.8.7", (api) => {
      // ────────────────────────────────────────────────────────────────────────────
      // 1. Lookup the site-settings service so we can read `commands`.
      // ────────────────────────────────────────────────────────────────────────────
      const siteSettings = container.lookup("service:site-settings");

      // ────────────────────────────────────────────────────────────────────────────
      // 2. CARET POSITION HELPER
      //    Mirrors the textarea’s CSS in a hidden <div> to compute caret coords.
      // ────────────────────────────────────────────────────────────────────────────
      function getCaretCoordinates(el, position) {
        const div = document.createElement("div");
        const style = getComputedStyle(el);
        const propsToCopy = [
          "boxSizing","width","height","overflowX","overflowY",
          "borderTopWidth","borderRightWidth","borderBottomWidth","borderLeftWidth",
          "paddingTop","paddingRight","paddingBottom","paddingLeft",
          "fontStyle","fontVariant","fontWeight","fontStretch","fontSize","fontSizeAdjust",
          "lineHeight","fontFamily","textAlign","textTransform","textIndent",
          "textDecoration","letterSpacing","wordSpacing"
        ];
        propsToCopy.forEach((p) => {
          div.style[p] = style[p];
        });
        div.style.position = "absolute";
        div.style.visibility = "hidden";
        div.style.whiteSpace = "pre-wrap";
        div.style.wordWrap = "break-word";

        // Put text up to caret into the mirror
        div.textContent = el.value.substring(0, position);

        // Append a <span> at the caret so we can measure offsetLeft/offsetTop
        const span = document.createElement("span");
        span.textContent = el.value.substring(position) || ".";
        div.appendChild(span);

        document.body.appendChild(div);
        const coords = {
          top:  span.offsetTop  + parseInt(style["borderTopWidth"], 10),
          left: span.offsetLeft + parseInt(style["borderLeftWidth"], 10)
        };
        document.body.removeChild(div);
        return coords;
      }

      // ────────────────────────────────────────────────────────────────────────────
      // 3. ESCAPE STRING FOR SAFE REGEX USAGE
      // ────────────────────────────────────────────────────────────────────────────
      function escapeRegex(str) {
        return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      }

      // ────────────────────────────────────────────────────────────────────────────
      // 4. SHOW DROPDOWN
      //
      //    - If a dropdown exists, remove it.
      //    - Compute caret coordinates → position a floating <div> there.
      //    - Populate with “parsedTemplates” and support ↑/↓/Enter/Esc + click‐to‐insert.
      // ────────────────────────────────────────────────────────────────────────────
      function showDropdown(textarea, parsedTemplates, matchedTrigger) {
        // (a) Remove any existing dropdown
        const existing = document.getElementById("my-template-dropdown");
        if (existing) {
          existing.remove();
        }

        // (b) Create container
        const dropdown = document.createElement("div");
        dropdown.id = "my-template-dropdown";
        dropdown.style.position = "absolute";
        dropdown.style.background = "#fff";
        dropdown.style.border = "1px solid #ccc";
        dropdown.style.zIndex = 10000;
        dropdown.style.minWidth = "150px";
        dropdown.style.boxShadow = "0 2px 6px rgba(0,0,0,0.2)";
        dropdown.style.borderRadius = "4px";

        // (c) Compute caret’s pixel coords
        const caretPos   = textarea.selectionStart;
        const coords     = getCaretCoordinates(textarea, caretPos);
        const taRect     = textarea.getBoundingClientRect();
        const lineHeight = parseInt(getComputedStyle(textarea).lineHeight, 10) || 16;

        dropdown.style.left = `${taRect.left + window.scrollX + coords.left}px`;
        dropdown.style.top  = `${taRect.top  + window.scrollY + coords.top + lineHeight}px`;

        // (d) Build each item, highlight first by default
        let selectedIndex = 0;
        const items = [];

        parsedTemplates.forEach((tObj, idx) => {
          const item = document.createElement("div");
          item.innerText = tObj.label;
          item.style.padding = "8px";
          item.style.cursor = "pointer";
          item.style.userSelect = "none";
          if (idx === selectedIndex) {
            item.style.background = "#bde4ff";
          }

          item.onclick = () => {
            // Remove the matched trigger (e.g. "/template") and insert this snippet
            const regex = new RegExp(`${escapeRegex(matchedTrigger)}\\s*$`);
            textarea.value = textarea.value.replace(regex, "") + tObj.text;
            cleanup();
            textarea.focus();
          };

          dropdown.appendChild(item);
          items.push(item);
        });

        // (e) updateSelection: clamp index so it never wraps
        function updateSelection(newIdx) {
          items[selectedIndex].style.background = "";
          if (newIdx < 0) {
            newIdx = 0;
          }
          if (newIdx >= items.length) {
            newIdx = items.length - 1;
          }
          selectedIndex = newIdx;
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

        // (g) Click‐outside closes dropdown
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
      // 5. HOOK INTO THE COMPOSER TEXTAREA ONCE IT APPEARS
      //
      //    We use a MutationObserver to detect when `.d-editor-input` is inserted.
      //    Bind a `keyup` listener that looks for any defined trigger at line‐end.
      // ────────────────────────────────────────────────────────────────────────────
      document.addEventListener("DOMContentLoaded", () => {
        const observer = new MutationObserver(() => {
          const textarea = document.querySelector(".d-editor-input");
          if (textarea && !textarea.__slashTemplateHooked) {
            textarea.__slashTemplateHooked = true;

            textarea.addEventListener("keyup", (e) => {
              // Ignore navigational keys so we don’t re-open/reset the dropdown
              if (["ArrowDown", "ArrowUp", "Enter", "Escape"].includes(e.key)) {
                return;
              }

              const val = textarea.value;
              // 5a. Read and parse the `commands` block from settings
              const raw = siteSettings.commands || "[]";
              let commandsArr;
              try {
                commandsArr = JSON.parse(raw);
              } catch {
                commandsArr = [];
              }

              if (!Array.isArray(commandsArr) || commandsArr.length === 0) {
                return; // no commands defined
              }

              // 5b. Build a single regex matching ANY trigger at end‐of‐line
              //     e.g. if commandsArr = [{trigger:"/foo"}, {trigger:"/bar"}], 
              //     we build /(?:\/foo|\/bar)\s*$/
              const triggers = commandsArr.map(c => c.trigger || "").filter(t => t.length > 0);
              if (triggers.length === 0) {
                return;
              }
              const escaped = triggers.map(t => escapeRegex(t));
              const reTriggers = new RegExp(`(?:${escaped.join("|")})\\s*$`);

              const match = val.match(reTriggers);
              if (!match) {
                return;
              }

              // 5c. Determine which trigger matched (exact string, trimmed)
              const matchedTrigger = match[0].trim();

              // 5d. Find that command’s templates array
              const cmdObj = commandsArr.find(c => c.trigger === matchedTrigger);
              let parsedTemplates = Array.isArray(cmdObj?.templates) ? cmdObj.templates : [];

              // Optional fallback: if someone forgot to add any templates for this trigger,
              // you can supply defaults or simply return (show nothing). Here we return.
              if (!parsedTemplates.length) {
                return;
              }

              showDropdown(textarea, parsedTemplates, matchedTrigger);
            });
          }
        });

        observer.observe(document.body, { childList: true, subtree: true });
      });
    });
  }
};