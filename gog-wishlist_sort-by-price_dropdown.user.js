// ==UserScript==
// @name         GOG Wishlist - Sort by Price (Dropdown)
// @namespace    https://github.com/idkicarus
// @homepageURL  https://github.com/idkicarus/GOG-wishlist-sort
// @supportURL   https://github.com/idkicarus/GOG-wishlist-sort/issues
// @description  Enables sorting by price (ascending and descending) via a dropdown option added to the GOG wishlist page. Switching between "sort by price" and a native sorting option (title, date added, user reviews) automatically refreshes the page twice. 
// @version      1.06
// @license      MIT
// @match        https://www.gog.com/account/wishlist*
// @match        https://www.gog.com/*/account/wishlist*
// @run-at       document-start
// @grant        none
// @updateURL    https://raw.githubusercontent.com/idkicarus/gog-wishlist-sort/main/gog-wishlist_sort-by-price_dropdown.user.js
// @downloadURL  https://raw.githubusercontent.com/idkicarus/gog-wishlist-sort/main/gog-wishlist_sort-by-price_dropdown.user.js
// ==/UserScript==

(function () {
    "use strict";

    /*
     * Maintenance notes:
     * - This script inserts a custom "Price" item into GOG's existing sort dropdown.
     * - The most fragile pieces are the dropdown/header selectors and the price
     *   selectors in getRowPriceText(); update those first if GOG changes markup.
     * - sessionStorage is used only to recover cleanly when switching from the
     *   custom price sort back to one of GOG's native sort options.
     */

    // --------------------------------------------------
    // Global State Variables
    // --------------------------------------------------

    const LOG_PREFIX = "[Sort By Price]";
    const REFRESH_STAGE_KEY = "gog_sort_fix_stage";
    const LAST_PRICE_SORT_KEY = "gog_last_sort_was_price";

    const PRICE_OPTION_ID = "sort-by-price";
    const PRICE_HEADER_ID = "sort-by-price-header";
    const HIDE_STYLE_ID = "gog-sort-refresh-hide-style";

    // Give GOG a small amount of time to record/apply the native dropdown choice
    // before reload. This is intentionally lighter than the previous version.
    const FIRST_NATIVE_RELOAD_DELAY_MS = 350;
    const SECOND_NATIVE_RELOAD_DELAY_MS = 75;

    // First click sorts ascending. Each successful price sort toggles this.
    let ascendingOrder = true;

    // Persist this so GOG's dynamic page behavior does not erase the fact that
    // price sorting was the last custom sort before a native sort click.
    let lastSortWasPrice = sessionStorage.getItem(LAST_PRICE_SORT_KEY) === "1";

    // Prevent duplicate native-sort recovery handling from repeated click/event passes.
    let nativeSortRecoveryStarted = false;

    // --------------------------------------------------
    // Small Helper Functions
    // --------------------------------------------------

    function runWhenDomReady(callback) {
        if (document.readyState === "loading") {
            document.addEventListener("DOMContentLoaded", callback, { once: true });
        } else {
            callback();
        }
    }

    function runWhenBodyReady(callback) {
        if (document.body) {
            callback();
            return;
        }

        document.addEventListener("DOMContentLoaded", callback, { once: true });
    }

    function getText(element) {
        if (!element) {
            return null;
        }

        // Prefer innerText because it better reflects rendered text and often preserves
        // useful spacing/line breaks between original and discounted prices.
        const text = (element.innerText || element.textContent || "").trim();
        return text || null;
    }

    function setLastSortWasPrice(value) {
        lastSortWasPrice = value;

        if (value) {
            sessionStorage.setItem(LAST_PRICE_SORT_KEY, "1");
        } else {
            sessionStorage.removeItem(LAST_PRICE_SORT_KEY);
        }
    }

    // --------------------------------------------------
    // Wishlist Visibility Helpers
    // --------------------------------------------------

    function injectWishlistHideStyle() {
        if (document.getElementById(HIDE_STYLE_ID)) {
            return;
        }

        const style = document.createElement("style");
        style.id = HIDE_STYLE_ID;
        style.textContent = `
            .account__product-lists {
                opacity: 0 !important;
                pointer-events: none !important;
            }
        `;

        const parent = document.head || document.documentElement;
        parent.appendChild(style);
    }

    function removeWishlistHideStyle() {
        const style = document.getElementById(HIDE_STYLE_ID);

        if (style) {
            style.remove();
        }
    }

    function hideWishlist() {
        injectWishlistHideStyle();

        const wishlistSection = document.querySelector(".account__product-lists");

        if (wishlistSection) {
            wishlistSection.style.opacity = "0";
            wishlistSection.style.pointerEvents = "none";
        }
    }

    function showWishlist() {
        removeWishlistHideStyle();

        const wishlistSection = document.querySelector(".account__product-lists");

        if (wishlistSection) {
            wishlistSection.style.opacity = "1";
            wishlistSection.style.pointerEvents = "auto";
        }
    }

    // --------------------------------------------------
    // Dropdown Header Helpers
    // --------------------------------------------------

    function getDropdownPointerWrapper() {
        return document.querySelector(".header__dropdown ._dropdown__pointer-wrapper");
    }

    function getNativeSortLabelElements() {
        return Array.from(document.querySelectorAll(".header__dropdown span[ng-show]"));
    }

    function hideNativeSortLabels() {
        getNativeSortLabelElements().forEach(element => {
            element.style.display = "none";
        });
    }

    function showNativeSortLabels() {
        getNativeSortLabelElements().forEach(element => {
            element.style.display = "";
        });
    }

    function removeCustomSortHeader() {
        const customSortHeader = document.getElementById(PRICE_HEADER_ID);

        if (customSortHeader) {
            customSortHeader.remove();
        }
    }

    function resetSortHeaderToNative() {
        removeCustomSortHeader();
        showNativeSortLabels();
    }

    function resetSortHeaderToNativeRepeatedly() {
        // GOG/Angular may update the dropdown label shortly after the click.
        // A short follow-up reset is usually enough to prevent the custom Price label
        // from sticking around.
        resetSortHeaderToNative();
        setTimeout(resetSortHeaderToNative, 100);
    }

    function showTemporaryNativeHeader(option) {
        const sortHeader = getDropdownPointerWrapper();

        if (!sortHeader) {
            return;
        }

        let customSortHeader = document.getElementById(PRICE_HEADER_ID);

        if (!customSortHeader) {
            customSortHeader = document.createElement("span");
            customSortHeader.id = PRICE_HEADER_ID;
            sortHeader.insertBefore(customSortHeader, sortHeader.firstChild);
        }

        customSortHeader.textContent = option;
        customSortHeader.title = `Switching to native sort: ${option}`;
        customSortHeader.style.display = "inline-block";
    }

    function updateSortHeader(currentDirection = null) {
        const sortHeader = getDropdownPointerWrapper();

        if (!sortHeader) {
            console.log(`${LOG_PREFIX} ERROR: Sort header not found.`);
            return;
        }

        hideNativeSortLabels();

        let customSortHeader = document.getElementById(PRICE_HEADER_ID);

        if (!customSortHeader) {
            customSortHeader = document.createElement("span");
            customSortHeader.id = PRICE_HEADER_ID;
            sortHeader.insertBefore(customSortHeader, sortHeader.firstChild);
        }

        if (currentDirection === "asc") {
            customSortHeader.textContent = "Price ↑";
            customSortHeader.title = "Currently sorted by price: low to high.";
        } else if (currentDirection === "desc") {
            customSortHeader.textContent = "Price ↓";
            customSortHeader.title = "Currently sorted by price: high to low.";
        } else {
            customSortHeader.textContent = "Price";
            customSortHeader.title = "Sort by price.";
        }

        customSortHeader.style.display = "inline-block";
    }

    // --------------------------------------------------
    // Two-Stage Refresh for Native Sorting
    // --------------------------------------------------

    function processNativeSortRefreshStage() {
        if (sessionStorage.getItem(REFRESH_STAGE_KEY) !== "1") {
            return;
        }

        // Because this script runs at document-start, inject CSS immediately to reduce flicker.
        injectWishlistHideStyle();
        runWhenDomReady(hideWishlist);

        console.log(`${LOG_PREFIX} In refresh stage 1; scheduling second refresh.`);

        setTimeout(() => {
            console.log(`${LOG_PREFIX} Performing second refresh to finalize native sorting.`);
            sessionStorage.removeItem(REFRESH_STAGE_KEY);
            setLastSortWasPrice(false);
            resetSortHeaderToNative();
            location.reload();
        }, SECOND_NATIVE_RELOAD_DELAY_MS);
    }

    processNativeSortRefreshStage();

    function handleNativeSortClick(option) {
        if (nativeSortRecoveryStarted) {
            console.log(`${LOG_PREFIX} Native sort recovery is already in progress.`);
            return;
        }

        nativeSortRecoveryStarted = true;

        console.log(`${LOG_PREFIX} Switching to native sort: ${option}`);

        // Stop showing Price immediately. Use the clicked native option as a temporary
        // label while GOG processes the click and before the first reload happens.
        showNativeSortLabels();
        showTemporaryNativeHeader(option);
        setTimeout(resetSortHeaderToNativeRepeatedly, 100);

        sessionStorage.setItem(REFRESH_STAGE_KEY, "1");
        setLastSortWasPrice(false);

        console.log(`${LOG_PREFIX} First refresh scheduled to restore native sorting.`);
        hideWishlist();

        setTimeout(() => {
            resetSortHeaderToNative();
            location.reload();
        }, FIRST_NATIVE_RELOAD_DELAY_MS);
    }

    // --------------------------------------------------
    // Price Parsing
    // --------------------------------------------------

    function parseOneNumberToken(numberText) {
        if (!numberText) {
            return null;
        }

        let normalizedNumber = numberText.trim();

        const lastComma = normalizedNumber.lastIndexOf(",");
        const lastDot = normalizedNumber.lastIndexOf(".");

        if (lastComma !== -1 && lastDot !== -1) {
            // Both separators exist. The last one is the decimal separator.
            const decimalSeparator = lastComma > lastDot ? "," : ".";
            const thousandsSeparator = decimalSeparator === "," ? "." : ",";

            normalizedNumber = normalizedNumber
                .replaceAll(thousandsSeparator, "")
                .replace(decimalSeparator, ".");
        } else if (lastComma !== -1) {
            const parts = normalizedNumber.split(",");
            const finalGroup = parts[parts.length - 1];

            // Treat a final two-digit group as cents; otherwise treat commas as thousands separators.
            normalizedNumber = finalGroup.length === 2
                ? `${parts.slice(0, -1).join("")}.${finalGroup}`
                : parts.join("");
        } else if (lastDot !== -1) {
            const parts = normalizedNumber.split(".");
            const finalGroup = parts[parts.length - 1];

            // Treat a final two-digit group as cents; otherwise treat dots as thousands separators.
            normalizedNumber = finalGroup.length === 2
                ? `${parts.slice(0, -1).join("")}.${finalGroup}`
                : parts.join("");
        }

        const parsedNumber = Number(normalizedNumber);
        return Number.isFinite(parsedNumber) ? parsedNumber : null;
    }

    function parsePriceText(priceText) {
        if (!priceText) {
            return null;
        }

        const normalizedText = priceText.replace(/\u00a0/g, " ").trim();

        if (/\bfree\b/i.test(normalizedText)) {
            return 0;
        }

        // Extract numeric-looking tokens. This is intentionally more forgiving than
        // cleaning the entire string at once, because discounted GOG price blocks may
        // contain a discount percent, an original price, and a final price.
        const numberTokens = normalizedText.match(/\d[\d.,]*/g);

        if (!numberTokens || !numberTokens.length) {
            return null;
        }

        const parsedNumbers = numberTokens
            .map(parseOneNumberToken)
            .filter(number => number !== null);

        if (!parsedNumbers.length) {
            return null;
        }

        // Prefer the last usable number. In discounted price blocks, the final displayed
        // number is usually the current purchase price.
        return parsedNumbers[parsedNumbers.length - 1];
    }

    // --------------------------------------------------
    // Wishlist Lookup
    // --------------------------------------------------

    function getWishlistListInner() {
        const listInners = Array.from(document.querySelectorAll(".list-inner"));

        // Keep compatibility with the original working script: the wishlist was assumed
        // to be the second .list-inner element. Prefer that when it contains product rows.
        const originalTarget = listInners[1];
        if (originalTarget && originalTarget.querySelector(".product-row-wrapper")) {
            return originalTarget;
        }

        // Fallback: choose the .list-inner that actually contains product rows.
        return listInners.find(element => element.querySelector(".product-row-wrapper")) || null;
    }

    // --------------------------------------------------
    // Price Extraction and Availability Classification
    // --------------------------------------------------

    function getRowPriceText(row) {
        // Preserve the original working selector behavior first.
        const discountElement = row.querySelector(".price-text--discount span.ng-binding");
        const priceElement = row.querySelector("._price.product-state__price");

        const discountText = getText(discountElement);
        if (discountText) {
            return discountText;
        }

        const priceText = getText(priceElement);
        if (priceText) {
            return priceText;
        }

        // Conservative fallbacks for minor GOG markup changes.
        const fallbackElement = row.querySelector(
            ".price-text--discount, .product-state__price .ng-binding, .product-state__price"
        );

        return getText(fallbackElement);
    }

    function getProductSortData(row, index) {
        const titleElement = row.querySelector(".product-row__title");
        const title = titleElement ? titleElement.innerText.trim() : "Unknown Title";

        const priceText = getRowPriceText(row);
        const priceNumeric = parsePriceText(priceText);

        const soonFlag = row.querySelector(".product-title__flag--soon");
        const tbaBadge = row.querySelector(".product-state__is-tba");

        // Keep the original visibility-style TBA check.
        const isTbaVisible = tbaBadge && tbaBadge.offsetParent !== null;

        // Original behavior: visible TBA badge or no price text means unavailable.
        const isTBA = isTbaVisible || priceText === null || /\btba\b/i.test(priceText || "");

        // Original workaround: some SOON rows expose a fake 99.99 placeholder price.
        const isSoonPlaceholder = Boolean(soonFlag) && priceNumeric === 99.99;

        if (isTBA || isSoonPlaceholder || priceNumeric === null || Number.isNaN(priceNumeric)) {
            const reason = isTbaVisible
                ? "TBA"
                : isSoonPlaceholder
                    ? "SOON placeholder price"
                    : "No usable price";

            return {
                row,
                index,
                title,
                price: null,
                isUnavailable: true,
                unavailableReason: reason
            };
        }

        return {
            row,
            index,
            title,
            price: priceNumeric,
            isUnavailable: false,
            unavailableReason: null
        };
    }

    // --------------------------------------------------
    // Custom Sorting Logic
    // --------------------------------------------------

    function sortByPrice() {
        console.log(`${LOG_PREFIX} Price option clicked. Sorting started.`);

        const listInner = getWishlistListInner();

        if (!listInner) {
            console.error(`${LOG_PREFIX} ERROR: .list-inner element not found.`);
            return false;
        }

        const productRows = Array.from(listInner.querySelectorAll(".product-row-wrapper"));
        console.log(`${LOG_PREFIX} Found ${productRows.length} product rows.`);

        const pricedItems = [];
        const tbaItems = [];

        productRows.forEach((row, index) => {
            const sortData = getProductSortData(row, index);

            if (sortData.isUnavailable) {
                console.log(`${LOG_PREFIX} Marked as TBA/SOON: ${sortData.title} (${sortData.unavailableReason})`);
                tbaItems.push(sortData);
            } else {
                console.log(`${LOG_PREFIX} ${sortData.title} - Extracted Price: ${sortData.price}`);
                pricedItems.push(sortData);
            }
        });

        console.log(`${LOG_PREFIX} Sorting priced items.`);

        pricedItems.sort((a, b) => {
            const priceDifference = ascendingOrder
                ? a.price - b.price
                : b.price - a.price;

            // Keep original relative order when prices are identical.
            return priceDifference || a.index - b.index;
        });

        console.log(
            `${LOG_PREFIX} Sorted prices:`,
            pricedItems.map(item => `${item.title}: ${item.price}`)
        );

        // Append sorted priced items first, then unavailable/TBA/SOON items in their original order.
        // appendChild moves existing nodes, so this avoids destroying Angular-managed row content.
        pricedItems.forEach(item => listInner.appendChild(item.row));
        tbaItems.forEach(item => listInner.appendChild(item.row));

        updateSortHeader(ascendingOrder ? "asc" : "desc");

        ascendingOrder = !ascendingOrder;
        nativeSortRecoveryStarted = false;
        setLastSortWasPrice(true);

        console.log(`${LOG_PREFIX} Sorting completed.`);
        return true;
    }

    // --------------------------------------------------
    // Add the "Price" Option to the Existing Dropdown
    // --------------------------------------------------

    function addSortByPriceOption() {
        const dropdown = document.querySelector(".header__dropdown ._dropdown__items");

        if (!dropdown) {
            return false;
        }

        if (document.getElementById(PRICE_OPTION_ID)) {
            return true;
        }

        const sortPriceOption = document.createElement("span");
        sortPriceOption.id = PRICE_OPTION_ID;
        sortPriceOption.className = "_dropdown__item";
        sortPriceOption.textContent = "Price";
        sortPriceOption.style.cursor = "pointer";
        sortPriceOption.title = "Sort wishlist by price.";

        sortPriceOption.addEventListener("click", event => {
            event.preventDefault();
            sortByPrice();
        });

        // Insert Price first so it is easy to find.
        dropdown.insertBefore(sortPriceOption, dropdown.firstChild);

        console.log(`${LOG_PREFIX} 'Price' option added to sort dropdown.`);
        return true;
    }

    function startDropdownObserver() {
        addSortByPriceOption();

        const observer = new MutationObserver(() => {
            addSortByPriceOption();
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true
        });
    }

    runWhenBodyReady(startDropdownObserver);

    // --------------------------------------------------
    // Native Sort Refresh Logic
    // --------------------------------------------------

    document.addEventListener(
        "click",
        event => {
            const nativeSortItem = event.target.closest(".header__dropdown ._dropdown__item");

            if (!nativeSortItem) {
                return;
            }

            // Ignore the custom Price option. Native options are handled by GOG first,
            // then this script schedules the recovery reloads.
            if (nativeSortItem.id === PRICE_OPTION_ID) {
                return;
            }

            if (lastSortWasPrice || sessionStorage.getItem(LAST_PRICE_SORT_KEY) === "1") {
                const optionText = nativeSortItem.innerText.trim();
                handleNativeSortClick(optionText);
            } else {
                resetSortHeaderToNativeRepeatedly();
            }
        },
        true
    );
})();