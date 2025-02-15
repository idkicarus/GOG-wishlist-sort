// ==UserScript==
// @name        GOG Wishlist - Sort by Price (Dropdown)
// @namespace   https://github.com/idkicarus/gog-wishlist-sort-by-price
// @description Enables sorting by price (ascending and descending) via the dropdown on a GOG wishlist page. Switching between "sort by price" and a native sorting option (title, date added, user reviews) automatically refreshes the page twice. 
// @version     1.01
// @license MIT
// @updateURL   https://raw.githubusercontent.com/idkicarus/gog-wishlist-sort-by-price/refs/heads/main/gog-wishlist_sort-by-price_dropdown.js
// @downloadURL https://raw.githubusercontent.com/idkicarus/gog-wishlist-sort-by-price/refs/heads/main/gog-wishlist_sort-by-price_dropdown.js
// @match       https://www.gog.com/account/wishlist*
// @match       https://www.gog.com/*/account/wishlist*
// @run-at      document-start
// @grant       none
// ==/UserScript==

(function () {
    // Global flags to track whether the last sort was by price and the current sort order (ascending vs descending)
    let lastSortWasPrice = false;
    let ascendingOrder = true;

    // Retrieve the refresh stage from sessionStorage.
    // This is used to control a two-step refresh process which minimizes visual glitches when switching sort methods.
    let refreshStage = sessionStorage.getItem("gog_sort_fix_stage");

    /**
     * Hides the wishlist section by setting its opacity to 0 and disabling pointer events.
     * This method is used to prevent users from seeing the intermediate state during a refresh.
     */
    function hideWishlist() {
        // Select the wishlist container element
        let wishlistSection = document.querySelector(".account__product-lists");
        if (wishlistSection) {
            wishlistSection.style.opacity = "0"; // Make wishlist invisible but still present in the DOM
            wishlistSection.style.pointerEvents = "none"; // Disable interactions with the wishlist
        }
    }

    /**
     * Shows the wishlist section by restoring its opacity and pointer events.
     * This is called after the refresh process to reveal the sorted content.
     */
    function showWishlist() {
        let wishlistSection = document.querySelector(".account__product-lists");
        if (wishlistSection) {
            wishlistSection.style.opacity = "1"; // Restore visibility
            wishlistSection.style.pointerEvents = "auto"; // Re-enable interactions
        }
    }

    // If we are on the first refresh stage (i.e. refreshStage equals "1"),
    // wait for the DOM to be loaded and then hide the wishlist.
    // This ensures that during the refresh process, the user does not see an unsorted list.
    if (refreshStage === "1") {
        document.addEventListener("DOMContentLoaded", () => {
            hideWishlist();
        });
    }

    /**
     * Sorts the wishlist products by price.
     * This function:
     *  - Locates the wishlist container element.
     *  - Extracts product rows and separates them into priced items and TBA (to be announced) items.
     *  - Determines the sort order (ascending or descending) based on whether the last sort was by price.
     *  - Rebuilds the DOM with sorted priced items followed by TBA items.
     */
    function sortByPrice() {
        console.log("[Sort By Price] Sorting Started.");

        // Query all elements with class 'list-inner' and use the second one (index 1) which contains the wishlist
        let listInner = document.querySelectorAll('.list-inner')[1];
        if (!listInner) {
            console.error("[Sort By Price] ERROR: Wishlist list-inner element not found.");
            return;
        }

        // Get all wishlist product rows as an array
        let productRows = Array.from(listInner.querySelectorAll('.product-row-wrapper'));
        console.log(`[Sort By Price] Found ${productRows.length} product rows.`);

        // Separate items into those with a price (pricedItems) and those that are "TBA" or not priced (tbaItems)
        let pricedItems = [];
        let tbaItems = [];

        // Process each product row
        productRows.forEach(row => {
            // Attempt to find the standard price element and the discounted price element if available
            const priceElement = row.querySelector('._price.product-state__price');
            const discountElement = row.querySelector('.price-text--discount span.ng-binding');
            // Check if there is a flag indicating the product is "coming soon"
            const soonFlag = row.querySelector('.product-title__flag--soon');

            // Determine the price text: use discount text if available, otherwise standard price text
            let priceText = discountElement
                ? discountElement.innerText
                : priceElement
                ? priceElement.innerText
                : null;

            // Convert the extracted text into a numeric value by stripping non-numeric characters
            let priceNumeric = priceText
                ? parseFloat(priceText.replace(/[^0-9.]/g, '').replace(/,/g, ''))
                : null;

            // Create a text content check to mark items that are "TBA"
            // Also consider soonFlag and absence of priceText as indicators for TBA status
            const textContent = priceElement ? priceElement.textContent.toUpperCase() : "";
            const isTBA = textContent.includes("TBA") || soonFlag || priceText === null;

            // Special case: if the price is exactly 99.99 and the "soon" flag is present, treat it as TBA
            // because the 99.99 is a placeholder for the real price
            if (isTBA || (priceNumeric && priceNumeric === 99.99 && soonFlag)) {
                tbaItems.push(row);
            } else {
                // For items with valid prices, push an object with the row and its numeric price
                pricedItems.push({ row, price: priceNumeric });
            }
        });

        // Toggle sorting order:
        // If the last sorting operation was by price, switch the order (toggle ascending/descending).
        // Otherwise, default to ascending order.
        ascendingOrder = lastSortWasPrice ? !ascendingOrder : true;
        pricedItems.sort((a, b) => (ascendingOrder ? a.price - b.price : b.price - a.price));

        // Trigger a reflow by briefly hiding and showing the list container.
        listInner.style.display = "none";
        listInner.offsetHeight; // Force reflow
        listInner.style.display = "block";

        // Clear all current child elements from the list container.
        while (listInner.firstChild) {
            listInner.removeChild(listInner.firstChild);
        }

        // Append sorted priced items first.
        pricedItems.forEach(item => listInner.appendChild(item.row));
        // Append TBA items at the end in their original order.
        tbaItems.forEach(item => listInner.appendChild(item));

        // Set flag indicating that sorting was done by price
        lastSortWasPrice = true;
        console.log("[Sort By Price] Sorting Completed.");
    }

    /**
     * Handles clicks on native sort options.
     * When a native sort option is selected after a custom "Price" sort, a two-stage refresh is triggered:
     *  - First refresh hides the wishlist.
     *  - Second refresh restores visibility and applies the native sort.
     *
     * @param {string} option - The label of the native sort option clicked.
     */
    function handleNativeSortClick(option) {
        console.log(`[Sort By Price] Switching to native sort: ${option}`);

        // If we're in the middle of the refresh process (first refresh already occurred)
        // then trigger the second refresh.
        if (refreshStage === "1") {
            console.log("[Sort By Price] Second refresh triggered to apply sorting.");
            sessionStorage.removeItem("gog_sort_fix_stage"); // Clear the refresh stage flag
            showWishlist(); // Reveal the wishlist
            return;
        }

        // If this is the first time switching away from "Price" sort, set the refresh stage flag.
        sessionStorage.setItem("gog_sort_fix_stage", "1");
        console.log("[Sort By Price] First refresh (hiding only wishlist section).");

        hideWishlist(); // Hide the wishlist section before refresh
        setTimeout(() => {
            // Reload the page after a short delay to let the UI update
            location.reload();
        }, 50); // 50ms delay is used to ensure the UI hides before the reload occurs
    }

    /**
     * Adds a "Price" sorting option to the sort dropdown.
     * This function waits until the dropdown is available in the DOM and then adds:
     *  - A new option to sort by price.
     *  - Event listeners on native sort options to handle refresh if a previous "Price" sort was active.
     */
    function addSortByPriceOption() {
        // Find the dropdown container for sorting options
        const dropdown = document.querySelector(".header__dropdown ._dropdown__items");
        if (!dropdown) {
            console.log("[Sort By Price] WARNING: Dropdown not found. Retrying...");
            // If the dropdown is not found, try again after 500ms (wait for DOM elements to be available)
            setTimeout(addSortByPriceOption, 500);
            return;
        }

        // If the "Price" sort option has already been added, exit early
        if (document.querySelector("#sort-by-price")) return;

        // Create a new span element to serve as the "Price" sort option
        let sortPriceOption = document.createElement("span");
        sortPriceOption.id = "sort-by-price";
        sortPriceOption.className = "_dropdown__item";
        sortPriceOption.innerText = "Price";
        // When clicked, sort the wishlist by price and update the sort header text
        sortPriceOption.addEventListener("click", () => {
            sortByPrice();
            updateSortHeader("Price");
        });

        // Append the new sort option to the dropdown list
        dropdown.appendChild(sortPriceOption);
        console.log("[Sort By Price] 'Price' option added to sort dropdown.");

        // Add click event listeners to all other native sort options in the dropdown.
        // When any of these are clicked after a "Price" sort, trigger the native sort refresh process.
        document.querySelectorAll(".header__dropdown ._dropdown__item").forEach(item => {
            if (item.id !== "sort-by-price") {
                item.addEventListener("click", () => {
                    // Only trigger the native sort refresh if the last sort was by price
                    if (lastSortWasPrice) {
                        handleNativeSortClick(item.innerText);
                    }
                });
            }
        });
    }

    /**
     * Updates the sort header displayed in the UI to reflect the currently active sort option.
     *
     * @param {string} option - The label of the sort option to display.
     */
    function updateSortHeader(option) {
        console.log(`[Sort By Price] Updating sort header to: ${option}`);
        // Find the container for the sort header pointer
        const sortHeader = document.querySelector(".header__dropdown ._dropdown__pointer-wrapper");
        if (!sortHeader) {
            console.log("[Sort By Price] ERROR: Sort header not found.");
            return;
        }

        // Hide any existing sort labels that are controlled by Angular's ng-show directive
        document.querySelectorAll(".header__dropdown span[ng-show]").forEach(el => {
            el.style.display = "none";
        });

        // Look for a custom header element we may have already created for the "Price" sort
        let customSortHeader = document.querySelector("#sort-by-price-header");
        if (!customSortHeader) {
            // If not found, create one and insert it at the beginning of the sort header container
            customSortHeader = document.createElement("span");
            customSortHeader.id = "sort-by-price-header";
            customSortHeader.className = "";
            sortHeader.insertBefore(customSortHeader, sortHeader.firstChild);
        }

        // Update the header text and ensure it is visible
        customSortHeader.innerText = option;
        customSortHeader.style.display = "inline-block";
    }

    /**
     * A MutationObserver is set up to monitor the document for when the sort dropdown is added to the DOM.
     * Once detected, the "Price" sort option is added and the observer disconnects to prevent further calls.
     */
    const observer = new MutationObserver((mutations, obs) => {
        // Check if the dropdown container for sort options is present
        if (document.querySelector(".header__dropdown ._dropdown__items")) {
            addSortByPriceOption(); // Add the "Price" option to the dropdown
            obs.disconnect(); // Stop observing since our work is done
        }
    });

    // Begin observing the body for changes in child elements and subtree modifications
    observer.observe(document.body, { childList: true, subtree: true });

    /**
     * If the script detects that it is in the first refresh stage (refreshStage equals "1"),
     * perform a second refresh after a short delay. This ensures that any changes made during
     * the refresh process are fully applied.
     */
    if (refreshStage === "1") {
        console.log("[Sort By Price] Performing second refresh to finalize sorting.");
        sessionStorage.removeItem("gog_sort_fix_stage"); // Clear the refresh flag

        setTimeout(() => {
            // Reload the page after 50ms to allow any pending UI updates to complete
            location.reload();
        }, 50); // 50ms delay; honestly, could be longer to ensure no race conditions before reload
    }
})();
