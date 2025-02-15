// ==UserScript==
// @name        GOG Wishlist - Sort by Price (Button)
// @namespace   https://github.com/idkicarus/gog-wishlist-sort-by-price
// @description Enables sorting by price (ascending and descending) via button on a GOG wishlist page. Switching between "sort by price" and a native sorting option (title, date added, user reviews) automatically refreshes the page twice. 
// @version     1.01
// @license     MIT
// @author      Jibril Ikharo
// @match       https://www.gog.com/account/wishlist*
// @match       https://www.gog.com/en/account/wishlist*
// @run-at      document-end
// @updateURL 	https://raw.githubusercontent.com/idkicarus/gog-wishlist-sort-by-price/main/gog-wishlist_sort-by-price_button.user.js
// @downloadURL  https://raw.githubusercontent.com/idkicarus/gog-wishlist-sort-by-price/main/gog-wishlist_sort-by-price_button.user.js
// ==/UserScript==


(function() {
    let ascendingOrder = true;
    let sort_btn = document.createElement("button");
    sort_btn.innerHTML = "Sort by Price";

    sort_btn.addEventListener("click", () => {
        console.log("[Sort By Price] Button Clicked. Sorting Started.");
        let listInner = document.querySelectorAll('.list-inner')[1];

        if (!listInner) {
            console.error("[Sort By Price] ERROR: .list-inner element not found.");
            return;
        }

        let productRows = Array.from(listInner.querySelectorAll('.product-row-wrapper'));
        console.log(`[Sort By Price] Found ${productRows.length} product rows.`);

        let pricedItems = [];
        let tbaItems = [];

        productRows.forEach(row => {
            const titleElement = row.querySelector('.product-row__title');
            const title = titleElement ? titleElement.innerText.trim() : "Unknown Title";
            const priceElement = row.querySelector('._price.product-state__price');
            const discountElement = row.querySelector('.price-text--discount span.ng-binding');
            const soonFlag = row.querySelector('.product-title__flag--soon'); // Detect "SOON" tag

            let priceText = discountElement ? discountElement.innerText : priceElement ? priceElement.innerText : null;
            let priceNumeric = priceText ? parseFloat(priceText.replace(/[^0-9.]/g, '').replace(/,/g, '')) : null;

            // Check for "SOON" or "TBA"
            const textContent = priceElement ? priceElement.textContent.toUpperCase() : "";
            const isTBA = textContent.includes("TBA") || soonFlag || priceText === null;

            // Fix for SOON items with $99.99 placeholders
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
        pricedItems.sort((a, b) => ascendingOrder ? a.price - b.price : b.price - a.price);

        console.log("[Sort By Price] Sorted Prices:", pricedItems.map(p => `${p.title}: $${p.price}`));

        // Instead of clearing the list, just move the elements in order
        pricedItems.forEach(item => listInner.appendChild(item.row));
        tbaItems.forEach(item => listInner.appendChild(item));

        ascendingOrder = !ascendingOrder;
        console.log("[Sort By Price] Sorting Completed.");
    });

    // Add wishlist sort button
    if (/wishlist/.test(document.location.href)) {
        setTimeout(() => {
            let el;
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
})();
