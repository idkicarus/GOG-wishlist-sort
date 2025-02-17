// ==UserScript==
// @name        GOG Wishlist - Sort by Price (Button)
// @namespace   https://github.com/idkicarus/gog-wishlist-sort
// @description Enables sorting by price (ascending and descending) via button on a GOG wishlist page. Switching between "sort by price" and a native sorting option (title, date added, user reviews) automatically refreshes the page twice. 
// @version     1.02
// @license     MIT
// @author      Jibril Ikharo
// @match       https://www.gog.com/account/wishlist*
// @match       https://www.gog.com/en/account/wishlist*
// @run-at      document-end
// @updateURL 	https://raw.githubusercontent.com/idkicarus/gog-wishlist-sort/main/gog-wishlist_sort-by-price_button.user.js
// @downloadURL  https://raw.githubusercontent.com/idkicarus/gog-wishlist-sort/main/gog-wishlist_sort-by-price_button.user.js
// ==/UserScript==


(function () {
    // -----------------------
    // State Variables
    // -----------------------
    // `ascendingOrder` determines whether the sorting order is ascending or descending.
    // `lastSortWasPrice` tracks if the last sorting action was performed by our custom "Sort by Price" button.
    // `refreshStage` is a flag stored in sessionStorage to coordinate the two-stage page refresh when reverting to a native sort.
    let ascendingOrder = true;
    let lastSortWasPrice = false;
    let refreshStage = sessionStorage.getItem("gog_sort_fix_stage");

    // -----------------------
    // Helper Functions for Refresh Process
    // -----------------------

    /**
     * hideWishlist
     * Hides the wishlist section by reducing its opacity and disabling pointer events.
     * This prevents users from seeing an unsorted or transitional state during the refresh process.
     */
    function hideWishlist() {
        let wishlistSection = document.querySelector(".account__product-lists");
        if (wishlistSection) {
            wishlistSection.style.opacity = "0";
            wishlistSection.style.pointerEvents = "none";
        }
    }

    /**
     * showWishlist
     * Restores the wishlist section's visibility and re-enables pointer events.
     * This is used after the refresh process is complete.
     */
    function showWishlist() {
        let wishlistSection = document.querySelector(".account__product-lists");
        if (wishlistSection) {
            wishlistSection.style.opacity = "1";
            wishlistSection.style.pointerEvents = "auto";
        }
    }

    // If the script detects that it is in the first stage of the refresh process (refreshStage === "1"),
    // hide the wishlist on DOMContentLoaded and schedule the second refresh.
    if (refreshStage === "1") {
        document.addEventListener("DOMContentLoaded", () => {
            hideWishlist();
        });
        console.log("[Sort By Price] In refresh stage 1; scheduling second refresh.");
        setTimeout(() => {
            console.log("[Sort By Price] Performing second refresh to finalize native sorting.");
            sessionStorage.removeItem("gog_sort_fix_stage"); // Clear the flag
            location.reload(); // Reload the page to complete the native sort
        }, 50);
    }

    // -----------------------
    // Custom Sorting Logic
    // -----------------------

    // Create a "Sort by Price" button.
    let sort_btn = document.createElement("button");
    sort_btn.innerHTML = "Sort by Price";

    // Event listener for the custom sort button.
    sort_btn.addEventListener("click", () => {
        console.log("[Sort By Price] Button Clicked. Sorting Started.");

        // Select the second '.list-inner' element which contains the wishlist items.
        let listInner = document.querySelectorAll('.list-inner')[1];
        if (!listInner) {
            console.error("[Sort By Price] ERROR: .list-inner element not found.");
            return;
        }

        // Retrieve all product rows from the wishlist.
        let productRows = Array.from(listInner.querySelectorAll('.product-row-wrapper'));
        console.log(`[Sort By Price] Found ${productRows.length} product rows.`);

        // Arrays for storing products with valid prices and products that are TBA (or marked as "SOON").
        let pricedItems = [];
        let tbaItems = [];

        // Process each product row.
        productRows.forEach(row => {
            // Extract the title from the product row.
            const titleElement = row.querySelector('.product-row__title');
            const title = titleElement ? titleElement.innerText.trim() : "Unknown Title";

            // Extract the standard price and discounted price elements.
            const priceElement = row.querySelector('._price.product-state__price');
            const discountElement = row.querySelector('.price-text--discount span.ng-binding');

            // Detect if the product is marked as "SOON" (or TBA).
            const soonFlag = row.querySelector('.product-title__flag--soon');

            // Determine the price text: if a discount price exists, use it; otherwise, use the standard price.
            let priceText = discountElement ? discountElement.innerText : priceElement ? priceElement.innerText : null;
            // Convert the price text to a numeric value by stripping out non-numeric characters.
            let priceNumeric = priceText ? parseFloat(priceText.replace(/[^0-9.]/g, '').replace(/,/g, '')) : null;

            // Check the text content to determine if the product is marked as "TBA" or "SOON".
            const textContent = priceElement ? priceElement.textContent.toUpperCase() : "";
            const isTBA = textContent.includes("TBA") || soonFlag || priceText === null;

            // Special handling: if price is exactly 99.99 and a "SOON" flag is present, treat it as TBA.
            if (isTBA || (priceNumeric && priceNumeric === 99.99 && soonFlag)) {
                console.log(`[Sort By Price] Marked as TBA/SOON: ${title} (Original Text: '${textContent}')`);
                tbaItems.push(row);
            } else {
                if (!priceNumeric) {
                    console.warn(`[Sort By Price] No valid price detected for: ${title}. Marking as TBA.`);
                    tbaItems.push(row);
                } else {
                    console.log(`[Sort By Price] ${title} - Extracted Price: ${priceNumeric} (Original Text: '${textContent}')`);
                    pricedItems.push({ row, price: priceNumeric, title });
                }
            }
        });

        console.log("[Sort By Price] Sorting priced items...");
        // Sort the priced items array based on the current order (ascending/descending).
        pricedItems.sort((a, b) => ascendingOrder ? a.price - b.price : b.price - a.price);
        console.log("[Sort By Price] Sorted Prices:", pricedItems.map(p => `${p.title}: $${p.price}`));

        // Rearrange the wishlist: first the sorted priced items, then the TBA items in their original order.
        pricedItems.forEach(item => listInner.appendChild(item.row));
        tbaItems.forEach(item => listInner.appendChild(item));

        // Toggle the sort order for next time and record that the last sort was done by price.
        ascendingOrder = !ascendingOrder;
        lastSortWasPrice = true;
        console.log("[Sort By Price] Sorting Completed.");
    });

    // Append the sort button to the page after a delay to ensure that the target container has loaded.
    if (/wishlist/.test(document.location.href)) {
        setTimeout(() => {
            let el;
            // Depending on the page layout, choose the appropriate parent element.
            if (/Wishlisted by/.test(document.querySelector(".header__main").innerHTML)) {
                el = document.querySelector(".collection-header");
            } else {
                el = document.querySelectorAll(".header__main");
                el = el[el.length - 1];
            }
            el.appendChild(sort_btn);
            console.log("[Sort By Price] Sort button added to UI.");
        }, 900);
    }

    // -----------------------
    // Native Sort Refresh Logic
    // -----------------------

    /**
     * handleNativeSortClick
     * Handles clicks on native sort options (e.g., sort by title, date added, user reviews).
     * If the last sort was performed with the custom price sort, this function triggers a two-stage refresh:
     *   1. First, it sets a flag in sessionStorage and reloads the page with the wishlist hidden.
     *   2. After reload, it clears the flag and shows the wishlist again, allowing the native sort to take effect.
     *
     * @param {string} option - The label of the native sort option selected.
     */
    function handleNativeSortClick(option) {
        console.log(`[Sort By Price] Switching to native sort: ${option}`);
        // If already in the first stage of refresh, complete the process.
        if (refreshStage === "1") {
            console.log("[Sort By Price] Second refresh triggered to apply native sorting.");
            sessionStorage.removeItem("gog_sort_fix_stage");
            showWishlist();
            return;
        }
        // Set the flag for the first refresh stage.
        sessionStorage.setItem("gog_sort_fix_stage", "1");
        console.log("[Sort By Price] First refresh (hiding wishlist before native sort).");
        hideWishlist();
        // Reload the page shortly after hiding the wishlist.
        setTimeout(() => {
            location.reload();
        }, 50);
    }

    /**
     * addNativeSortListeners
     * Attaches event listeners to native sort dropdown items. These listeners trigger the native sort refresh
     * logic when a native sort option is clicked after a custom price sort has been applied.
     */
    function addNativeSortListeners() {
        // Select all native sort dropdown items.
        const nativeSortItems = document.querySelectorAll(".header__dropdown ._dropdown__item");
        // If the dropdown items are not yet available, try again after a delay.
        if (!nativeSortItems.length) {
            setTimeout(addNativeSortListeners, 500);
            return;
        }
        // Attach event listeners to each native sort option.
        nativeSortItems.forEach(item => {
            // Prevent attaching multiple listeners to the same element.
            if (!item.dataset.priceSortListenerAdded) {
                item.addEventListener("click", () => {
                    // Only trigger the refresh if the last sort was the custom price sort.
                    if (lastSortWasPrice) {
                        handleNativeSortClick(item.innerText);
                        lastSortWasPrice = false; // Reset after handling native sort
                    }
                });
                item.dataset.priceSortListenerAdded = "true"; // Mark this element as having a listener attached.
            }
        });
    }

    // Use a MutationObserver to monitor the DOM for the addition of the native sort dropdown.
    // Once detected, attach event listeners to the native sort items.
    const observer = new MutationObserver((mutations, obs) => {
        if (document.querySelector(".header__dropdown ._dropdown__items")) {
            addNativeSortListeners();
            obs.disconnect(); // Stop observing once the dropdown is found and listeners are attached.
        }
    });
    // Observe changes in the entire document body to catch dynamic insertion of the sort dropdown.
    observer.observe(document.body, { childList: true, subtree: true });
})();