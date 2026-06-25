// ==UserScript==
// @name         GOG Wishlist - Sort by Price (Button)
// @namespace    https://github.com/idkicarus
// @homepageURL  https://github.com/idkicarus/GOG-wishlist-sort
// @supportURL   https://github.com/idkicarus/GOG-wishlist-sort/issues
// @description  Enables sorting by price (ascending and descending) via a button added to the GOG wishlist page. Switching between "sort by price" and a native sorting option (title, date added, user reviews) automatically refreshes the page twice. 
// @version      1.06
// @license      MIT
// @match        https://www.gog.com/account/wishlist*
// @match        https://www.gog.com/*/account/wishlist*
// @run-at       document-end
// @grant        none
// @updateURL    https://raw.githubusercontent.com/idkicarus/gog-wishlist-sort/main/gog-wishlist_sort-by-price_button.user.js
// @downloadURL  https://raw.githubusercontent.com/idkicarus/gog-wishlist-sort/main/gog-wishlist_sort-by-price_button.user.js
// ==/UserScript==

(function () {
    "use strict";

    /*
     * Maintenance notes:
     * - This script only reorders the wishlist rows already rendered on the page.
     * - The most fragile pieces are the CSS selectors in getWishlistListInner()
     *   and getRowPriceText(); update those first if GOG changes its markup.
     * - sessionStorage is used only to recover cleanly when switching from the
     *   custom price sort back to one of GOG's native sort options.
     */

    // --------------------------------------------------
    // Global State Variables
    // --------------------------------------------------

    const LOG_PREFIX = "[Sort By Price]";
    const REFRESH_STAGE_KEY = "gog_sort_fix_stage";
    const LAST_PRICE_SORT_KEY = "gog_last_sort_was_price";
    const BUTTON_ID = "gog-sort-by-price-button";

    // First click sorts ascending. Each successful sort toggles this.
    let ascendingOrder = true;

    // Persist this so GOG's dynamic page behavior does not erase the fact that
    // price sorting was the last custom sort before a native sort click.
    let lastSortWasPrice = sessionStorage.getItem(LAST_PRICE_SORT_KEY) === "1";

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

    function updateSortButtonLabel(button, currentDirection = null) {
        if (currentDirection === "asc") {
            button.textContent = "Sort by Price ↑";
            button.title = "Currently sorted by price: low to high. Click again to sort high to low.";
        } else if (currentDirection === "desc") {
            button.textContent = "Sort by Price ↓";
            button.title = "Currently sorted by price: high to low. Click again to sort low to high.";
        } else {
            button.textContent = "Sort by Price";
            button.title = "Click to sort by price, low to high.";
        }
    }

    // --------------------------------------------------
    // Wishlist Visibility Helpers
    // --------------------------------------------------

    function hideWishlist() {
        const wishlistSection = document.querySelector(".account__product-lists");

        if (wishlistSection) {
            wishlistSection.style.opacity = "0";
            wishlistSection.style.pointerEvents = "none";
        }
    }

    function showWishlist() {
        const wishlistSection = document.querySelector(".account__product-lists");

        if (wishlistSection) {
            wishlistSection.style.opacity = "1";
            wishlistSection.style.pointerEvents = "auto";
        }
    }

    // --------------------------------------------------
    // Two-Stage Refresh for Native Sorting
    // --------------------------------------------------

    function processNativeSortRefreshStage() {
        if (sessionStorage.getItem(REFRESH_STAGE_KEY) !== "1") {
            return;
        }

        runWhenDomReady(hideWishlist);

        console.log(`${LOG_PREFIX} In refresh stage 1; scheduling second refresh.`);

        setTimeout(() => {
            console.log(`${LOG_PREFIX} Performing second refresh to finalize native sorting.`);
            sessionStorage.removeItem(REFRESH_STAGE_KEY);
            setLastSortWasPrice(false);
            location.reload();
        }, 50);
    }

    processNativeSortRefreshStage();

    function handleNativeSortClick(option) {
        console.log(`${LOG_PREFIX} Switching to native sort: ${option}`);

        if (sessionStorage.getItem(REFRESH_STAGE_KEY) === "1") {
            console.log(`${LOG_PREFIX} Native sort recovery is already in progress.`);
            sessionStorage.removeItem(REFRESH_STAGE_KEY);
            setLastSortWasPrice(false);
            showWishlist();
            return;
        }

        sessionStorage.setItem(REFRESH_STAGE_KEY, "1");
        setLastSortWasPrice(false);

        console.log(`${LOG_PREFIX} First refresh started to restore native sorting.`);
        hideWishlist();

        setTimeout(() => {
            location.reload();
        }, 50);
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

        // Extract numeric-looking tokens. This is intentionally more forgiving than trying
        // to clean the entire string at once, because discounted GOG price blocks may contain
        // multiple numbers such as discount percent, original price, and final price.
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

        // Prefer the last usable number. In discounted price blocks, the final displayed number
        // is usually the current purchase price rather than the discount percent or original price.
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

    const sortBtn = document.createElement("button");
    sortBtn.id = BUTTON_ID;
    sortBtn.type = "button";
    sortBtn.style.marginLeft = "10px";
    sortBtn.style.cursor = "pointer";
    updateSortButtonLabel(sortBtn);

    sortBtn.addEventListener("click", () => {
        console.log(`${LOG_PREFIX} Button clicked. Sorting started.`);

        const listInner = getWishlistListInner();

        if (!listInner) {
            console.error(`${LOG_PREFIX} ERROR: .list-inner element not found.`);
            return;
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
        pricedItems.forEach(item => listInner.appendChild(item.row));
        tbaItems.forEach(item => listInner.appendChild(item.row));

        updateSortButtonLabel(sortBtn, ascendingOrder ? "asc" : "desc");

        ascendingOrder = !ascendingOrder;
        setLastSortWasPrice(true);

        console.log(`${LOG_PREFIX} Sorting completed.`);
    });

    // --------------------------------------------------
    // Append the "Sort by Price" Button to the UI
    // --------------------------------------------------

    function addSortButton() {
        if (!/wishlist/.test(document.location.href)) {
            return;
        }

        if (document.getElementById(BUTTON_ID)) {
            return;
        }

        setTimeout(() => {
            let el;

            const header = document.querySelector(".header__main");

            if (/Wishlisted by/.test(header?.innerHTML || "")) {
                el = document.querySelector(".collection-header");
            } else {
                const headers = document.querySelectorAll(".header__main");
                el = headers[headers.length - 1];
            }

            if (el && !document.getElementById(BUTTON_ID)) {
                el.appendChild(sortBtn);
                console.log(`${LOG_PREFIX} Sort button added to UI.`);
            }
        }, 900);
    }

    runWhenDomReady(addSortButton);

    // --------------------------------------------------
    // Native Sort Refresh Logic
    // --------------------------------------------------

    document.addEventListener("click", event => {
        const nativeSortItem = event.target.closest(".header__dropdown ._dropdown__item");

        if (!nativeSortItem) {
            return;
        }

        if (lastSortWasPrice || sessionStorage.getItem(LAST_PRICE_SORT_KEY) === "1") {
            handleNativeSortClick(nativeSortItem.innerText.trim());
        }
    });
})();