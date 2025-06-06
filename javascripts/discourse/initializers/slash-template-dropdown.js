import { withPluginApi } from "discourse/lib/plugin-api";

export default {
  name: "slash-template-dropdown",

  initialize(container) {
    withPluginApi("0.8.7", (api) => {
      this.siteSettings = container.lookup("service:site-settings");
      const currentUser = api.getCurrentUser();
      if (!currentUser) {
        return;
      }

      // fetch comma-separated list of group IDs from the site setting
      const rawAllowed = settings.template_dropdown_allowed_groups || "";
      // e.g. "4,10,27" → [4,10,27]
      const allowedGroupIds = rawAllowed
        .split(",")
        .map((s) => parseInt(s, 10))
        .filter((n) => !isNaN(n));

      // get the array of IDs for groups the user belongs to
      const userGroupIds = (currentUser.group_ids || []).map((n) => parseInt(n, 10));

      // if there’s no overlap, stop here
      const isMember = userGroupIds.some((g) => allowedGroupIds.includes(g));
      if (!isMember) {
        return;
      }

      // ────────────────────────────────────────────────────────────────────────────
      // CARET POSITION HELPER (unchanged)
      // ────────────────────────────────────────────────────────────────────────────
      function getCaretCoordinates(el, position) {
        const div = document.createElement("div");
        const style = getComputedStyle(el);
        const propsToCopy = [
          "boxSizing", "width", "height", "overflowX", "overflowY",
          "borderTopWidth", "borderRightWidth", "borderBottomWidth", "borderLeftWidth",
          "paddingTop", "paddingRight", "paddingBottom", "paddingLeft",
          "fontStyle", "fontVariant", "fontWeight", "fontStretch", "fontSize", "fontSizeAdjust",
          "lineHeight", "fontFamily", "textAlign", "textTransform", "textIndent",
          "textDecoration", "letterSpacing", "wordSpacing"
        ];
        propsToCopy.forEach((p) => {
          div.style[p] = style[p];
        });
        div.style.position = "absolute";
        div.style.visibility = "hidden";
        div.style.whiteSpace = "pre-wrap";
        div.style.wordWrap = "break-word";

        div.textContent = el.value.substring(0, position);

        const span = document.createElement("span");
        span.textContent = el.value.substring(position) || ".";
        div.appendChild(span);

        document.body.appendChild(div);
        const coords = {
          top: span.offsetTop + parseInt(style["borderTopWidth"], 10),
          left: span.offsetLeft + parseInt(style["borderLeftWidth"], 10)
        };
        document.body.removeChild(div);
        return coords;
      }

      // ────────────────────────────────────────────────────────────────────────────
      // ESCAPE STRING FOR SAFE REGEX
      // ────────────────────────────────────────────────────────────────────────────
      function escapeRegex(str) {
        return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      }

      // ────────────────────────────────────────────────────────────────────────────
      // SHOW DROPDOWN (unchanged except logs)
      // ────────────────────────────────────────────────────────────────────────────
      function showDropdown(textarea, parsedTemplates, matchedTrigger) {
        // console.log("[template-dropdown] showDropdown() called for trigger:", matchedTrigger);
        const existing = document.getElementById("my-template-dropdown");
        if (existing) {
          existing.remove();
        }

        const dropdown = document.createElement("div");
        dropdown.id = "my-template-dropdown";
        dropdown.style.position = "absolute";
        dropdown.style.background = "#fff";
        dropdown.style.border = "1px solid #ccc";
        dropdown.style.zIndex = 10000;
        dropdown.style.minWidth = "150px";
        dropdown.style.boxShadow = "0 2px 6px rgba(0,0,0,0.2)";
        dropdown.style.borderRadius = "4px";

        const caretPos = textarea.selectionStart;
        const coords = getCaretCoordinates(textarea, caretPos);
        const taRect = textarea.getBoundingClientRect();
        const lineHeight = parseInt(getComputedStyle(textarea).lineHeight, 10) || 16;

        dropdown.style.left = `${taRect.left + window.scrollX + coords.left}px`;
        dropdown.style.top = `${taRect.top + window.scrollY + coords.top + lineHeight}px`;

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
            // console.log("[template-dropdown] inserting text for:", tObj.label);
            const regex = new RegExp(`${escapeRegex(matchedTrigger)}\\s*$`);
            textarea.value = textarea.value.replace(regex, "") + tObj.text;
            cleanup();
            textarea.focus();
          };

          dropdown.appendChild(item);
          items.push(item);
        });

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

        function bodyClickHandler(e) {
          if (!dropdown.contains(e.target)) {
            cleanup();
          }
        }

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
      // HOOK INTO THE COMPOSER
      // ────────────────────────────────────────────────────────────────────────────
      document.addEventListener("DOMContentLoaded", () => {
        // console.log("[template-dropdown] DOMContentLoaded, setting up observer");
        const observer = new MutationObserver(() => {
          const textarea = document.querySelector(".d-editor-input");
          if (textarea && !textarea.__slashTemplateHooked) {
            // console.log("[template-dropdown] Found .d-editor-input, hooking keyup");
            textarea.__slashTemplateHooked = true;

            textarea.addEventListener("keyup", (e) => {
              // ignore navigation keys
              if (["ArrowDown", "ArrowUp", "Enter", "Escape"].includes(e.key)) {
                return;
              }

              const val = textarea.value;
              // console.log("[template-dropdown] keyup, content is:", JSON.stringify(val));

              // Parse the commands block from settings
              const raw = settings.commands || "[]";
              let commandsArr;
              try {
                commandsArr = JSON.parse(raw);
                // console.log("[template-dropdown] Parsed commands array:", commandsArr);
              } catch (err) {
                console.warn("[template-dropdown] Error parsing commands JSON:", err);
                commandsArr = [];
              }

              if (!Array.isArray(commandsArr) || commandsArr.length === 0) {
                // console.log("[template-dropdown] No commands defined, bailing");
                return;
              }

              // Build a regex to match any trigger at the very end
              const triggers = commandsArr
                .map((c) => c.trigger || "")
                .filter((t) => t.length > 0);
              // console.log("[template-dropdown] Available triggers:", triggers);

              if (triggers.length === 0) {
                return;
              }

              const escaped = triggers.map((t) => escapeRegex(t));
              // e.g. /(?:\/template|\/somethingElse)\s*$/
              const reTriggers = new RegExp(`(?:${escaped.join("|")})\\s*$`);
              // console.log("[template-dropdown] Using regex:", reTriggers);

              const match = val.match(reTriggers);
              if (!match) {
                // console.log("[template-dropdown] No trigger match on this input");
                return;
              }

              const matchedTrigger = match[0].trim();
              // console.log("[template-dropdown] Detected trigger:", matchedTrigger);

              // Find that command’s own templates
              const cmdObj = commandsArr.find((c) => c.trigger === matchedTrigger);
              let parsedTemplates = Array.isArray(cmdObj?.templates)
                ? cmdObj.templates
                : [];
              // console.log("[template-dropdown] Templates for this trigger:", parsedTemplates);

              if (!parsedTemplates.length) {
                // console.log("[template-dropdown] No templates defined for", matchedTrigger);
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