import { withPluginApi } from "discourse/lib/plugin-api";

export default {
  name: "slash-template-dropdown",

  initialize(container) {
    withPluginApi("0.8.7", (api) => {
      // ────────────────────────────────────────────────────────────────────────────
      // 1) LOOK UP SITE SETTINGS & CURRENT USER
      // ────────────────────────────────────────────────────────────────────────────
      this.siteSettings = container.lookup("service:site-settings");
      const currentUser = api.getCurrentUser();
      console.log("[template-dropdown] Initializing with user:", currentUser);
      if (!currentUser) {
        return; // not logged in → bail
      }

      // ────────────────────────────────────────────────────────────────────────────
      // 2) GLOBAL “WHO CAN SEE ANY SLASH DROPDOWN?” CHECK
      //    template_dropdown_allowed_groups is a Discourse‐type “list of groups,”
      //    so it comes back as a pipe-separated string like "1|10|43".
      // ────────────────────────────────────────────────────────────────────────────
      const rawGlobal = settings.template_dropdown_allowed_groups || "";
      console.log("[template-dropdown] Allowed groups setting:", rawGlobal);
      // Split on "|" because Discourse returns a pipe-separated string
      const globalAllowedIds = rawGlobal
        .split("|")
        .map((s) => parseInt(s, 10))
        .filter((n) => !isNaN(n));

      // Pull the current user’s group IDs from currentUser.groups
      const userGroupIds = (currentUser.groups || []).map((g) =>
        parseInt(g.id, 10)
      );
      console.log("[template-dropdown] User group IDs:", userGroupIds);

      // If no overlap, bail out immediately
      const passesGlobal = userGroupIds.some((id) =>
        globalAllowedIds.includes(id)
      );
      console.log(
        "[template-dropdown] User is member of allowed groups:",
        passesGlobal
      );
      if (!passesGlobal) {
        return; // user not in any globally‐allowed group
      }
      console.log(
        "[template-dropdown] User is allowed by global setting, continuing…"
      );

      // Cache these locally so inner functions can reference them:
      const siteSettings = settings
      const cachedUserGroupIds = userGroupIds.slice(); // copy the array

      // ────────────────────────────────────────────────────────────────────────────
      // 3) CARET POSITION HELPER (unchanged)
      // ────────────────────────────────────────────────────────────────────────────
      function getCaretCoordinates(el, position) {
        const div = document.createElement("div");
        const style = getComputedStyle(el);
        const propsToCopy = [
          "boxSizing",
          "width",
          "height",
          "overflowX",
          "overflowY",
          "borderTopWidth",
          "borderRightWidth",
          "borderBottomWidth",
          "borderLeftWidth",
          "paddingTop",
          "paddingRight",
          "paddingBottom",
          "paddingLeft",
          "fontStyle",
          "fontVariant",
          "fontWeight",
          "fontStretch",
          "fontSize",
          "fontSizeAdjust",
          "lineHeight",
          "fontFamily",
          "textAlign",
          "textTransform",
          "textIndent",
          "textDecoration",
          "letterSpacing",
          "wordSpacing",
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
          left: span.offsetLeft + parseInt(style["borderLeftWidth"], 10),
        };
        document.body.removeChild(div);
        return coords;
      }

      // ────────────────────────────────────────────────────────────────────────────
      // 4) ESCAPE REGEX (unchanged)
      // ────────────────────────────────────────────────────────────────────────────
      function escapeRegex(str) {
        return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      }

      // ────────────────────────────────────────────────────────────────────────────
      // 5) SHOW DROPDOWN (unchanged apart from logging)
      // ────────────────────────────────────────────────────────────────────────────
      function showDropdown(textarea, parsedTemplates, matchedTrigger) {
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
        const lineHeight =
          parseInt(getComputedStyle(textarea).lineHeight, 10) || 16;

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
      // 6) HOOK INTO THE COMPOSER
      // ────────────────────────────────────────────────────────────────────────────
      document.addEventListener("DOMContentLoaded", () => {
        const observer = new MutationObserver(() => {
          const textarea = document.querySelector(".d-editor-input");
          if (textarea && !textarea.__slashTemplateHooked) {
            textarea.__slashTemplateHooked = true;

            textarea.addEventListener("keyup", (e) => {
              // ignore navigation keys
              if (["ArrowDown", "ArrowUp", "Enter", "Escape"].includes(e.key)) {
                return;
              }

              const val = textarea.value;

              // ────────────────────────────────────────────────────────────
              // 6a) PARSE “commands” SETTING
              // ────────────────────────────────────────────────────────────
              const rawCommands = siteSettings.commands || "[]";
              let commandsArr;
              try {
                commandsArr = JSON.parse(rawCommands);
              } catch (err) {
                console.warn(
                  "[template-dropdown] Error parsing commands JSON:",
                  err
                );
                commandsArr = [];
              }
              if (!Array.isArray(commandsArr) || commandsArr.length === 0) {
                return;
              }

              // Build regex to see if any trigger sits at the end of the textarea
              const triggers = commandsArr
                .map((c) => c.trigger || "")
                .filter((t) => t.length > 0);
              if (triggers.length === 0) {
                return;
              }

              const escaped = triggers.map((t) => escapeRegex(t));
              const reTriggers = new RegExp(`(?:${escaped.join("|")})\\s*$`);
              const match = val.match(reTriggers);
              if (!match) {
                return;
              }

              const matchedTrigger = match[0].trim();
              const cmdObj = commandsArr.find(
                (c) => c.trigger === matchedTrigger
              );
              if (!cmdObj) {
                return;
              }

              // ────────────────────────────────────────────────────────────
              // 6b) PER-COMMAND “WHO CAN USE THIS TRIGGER?” CHECK
              //    Because in your JSON schema you declared “allowed_groups”
              //    as a `list` of `group`, Discourse WILL hand you back
              //    a true array of integers, e.g. [4, 10, 43].
              //    There is NO pipe‐separated string here—so do NOT split on "|".
              // ────────────────────────────────────────────────────────────
              if (
                Array.isArray(cmdObj.allowed_groups) &&
                cmdObj.allowed_groups.length
              ) {
                // cmdObj.allowed_groups is already something like [4, 10, 43]
                const cmdAllowedIds = cmdObj.allowed_groups
                  .map((n) => parseInt(n, 10))
                  .filter((n) => !isNaN(n));

                const hasAccess = cachedUserGroupIds.some((g) =>
                  cmdAllowedIds.includes(g)
                );
                console.log(
                  "[template-dropdown] Per-command allowed_groups:",
                  cmdAllowedIds,
                  "→ user has access?",
                  hasAccess
                );
                if (!hasAccess) {
                  return; // user not in this command’s allowed_groups
                }
              }

              // ────────────────────────────────────────────────────────────
              // 6c) SHOW THE DROPDOWN
              // ────────────────────────────────────────────────────────────
              const parsedTemplates = Array.isArray(cmdObj.templates)
                ? cmdObj.templates
                : [];
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
  },
};
