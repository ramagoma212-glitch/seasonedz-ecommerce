# Seasonedz Group Admin Handover Checklist

This is a simple guide for the Seasonedz Group owner on how to use the admin area of the website. It is written in plain steps. It does not require any technical knowledge to follow.

The live website address is:
https://ramagoma212-glitch.github.io/seasonedz-ecommerce/

## How to Log In

1. Go to the website address above.
2. Add `#/admin/login` to the end of the address, or ask whoever set up the site to give you a direct admin login link.
3. Enter your email and password.
4. Click Sign In.
5. If your email and password are correct, you will see the admin Dashboard.

If you see "Invalid email or password," check that you typed your email and password correctly, including capital letters. If you keep having trouble, contact whoever manages the site for you. Never ask anyone else, including an AI assistant, to type your password for you.

## Admin Menu Overview

Once logged in, you will see a menu with:

- Dashboard: a quick overview of orders, products and low stock items.
- Orders: every order placed on the site.
- Enquiries: messages sent through the Contact page.
- Products: every product in the shop, including drafts.

## How to Add a Product

1. Go to Products in the admin menu.
2. Click Add Product.
3. Fill in the product details:
   - Name
   - SKU (a short code for the product, for example SG-0011)
   - Category
   - Short description and full description
   - Price
   - Stock quantity
   - Status (see "Understanding Product Status" below)
   - Age range, features and any other details you want to add
4. Click Create Product.
5. A new product page will open so you can add images next.

New products are saved as Draft by default. A Draft product is never shown to customers on the public shop. This gives you time to add images and check everything before making it live.

## Understanding Product Status

- Draft: hidden from customers. Use this while you are still preparing a product.
- Active: shown to customers on the shop.
- Archived: hidden from customers, kept for your own records.
- Out of Stock: shown to customers, but marked as unavailable to buy right now.

Only change a product to Active once you are happy with its details and images.

## How to Edit Product Details

1. Go to Products in the admin menu.
2. Find the product you want to change and click Edit.
3. Update the fields you want to change, for example price, stock, description or status.
4. Click Save Changes.
5. You will see a message confirming the product was updated.

Note: the product SKU and slug (the web address for that product) cannot be changed once a product is created. This keeps existing links to the product working correctly.

## How to Upload Product Images

1. Open the product's Edit page.
2. Scroll down to the Product Images section.
3. Under Upload New Image, click Choose File and select a photo from your computer.
4. Type a short, clear description of the photo in Alt Text, for example "Front cover of the ABC Colouring Book."
5. Choose whether this photo is the Main Image or a Gallery Image.
   - Main Image is the photo customers see first, on the shop page and at the top of the product page.
   - Gallery Image is an extra photo shown alongside the main one.
6. Click Upload Image.
7. You should see a message confirming the upload, and the new photo will appear in the list.

Allowed photo types are JPG, PNG or WebP, up to 5 MB in size. Product photos become public as soon as they are uploaded, so only upload photos you are happy for customers to see.

Only upload one photo at a time and wait for the success message before uploading the next one, so you do not accidentally upload the same photo twice.

## How to Remove Wrong Images

1. Open the product's Edit page.
2. Find the photo you want to remove in the Product Images section.
3. Click Remove on that photo.
4. You will be asked to confirm, since this cannot be undone.
5. Click OK to confirm, or Cancel if you change your mind.

If you remove the current main photo, the website will automatically choose another photo on that product to be the new main photo, so the product is never left without one if other photos exist.

There is no way to bring back a removed photo. If you are not sure, it is safer to upload the correct photo first and remove the old one only once you can see the new one is showing correctly.

## Digital Downloads (PDF/ZIP products)

Products can now be either a normal Physical product (a real book/item
you post out) or a Digital download (a file customers download after
paying — nothing is posted).

### How to create a digital product

1. Go to Products &rarr; Add Product (or open an existing product's Edit page).
2. Fill in the name, category, description, price, etc. as normal.
3. Under Product Type, choose **Digital download**.
4. Save the product as Draft first — a digital product cannot be made
   Active until you've uploaded its file (see below). This is enforced
   by the website, not just a suggestion.

### How to upload the file

1. Open the digital product's Edit page. A new **Digital File** section
   appears (only for digital products).
2. Choose a PDF (or ZIP) file from your computer, up to 100 MB.
3. Type a File Display Name — this is what the customer sees, e.g.
   "ABC Colouring Book (Printable PDF)".
4. Optionally add the number of printable pages and a version note.
5. Click Upload File.
6. Once uploaded, you can set the product's Status to Active — customers
   can now buy it.

### How to replace a file

Open the product's Edit page and upload a new file the same way —
uploading always replaces the existing file for that product. The old
file is safely removed after the new one is confirmed saved, so
customers are never left without a working file mid-replacement.

### How customers receive their download

- **Logged-in customers**: after PayFast payment is confirmed, they can
  open the order under My Account &rarr; Orders and click Download.
- **Guest customers** (no account): after PayFast payment is confirmed,
  they receive an email with a secure, one-time download link. This
  link is personal to their order and expires after a few days — it
  should never be shared or forwarded.
- Nobody can download before payment is confirmed. A Pending, Failed,
  Cancelled or Refunded payment never unlocks a download, no matter what.
- Physical products in the same order are still delivered as normal — a
  mixed order (e.g. one physical book + one digital download) delivers
  the physical item by courier as usual, and unlocks the digital item
  once paid, without needing a courier booking for the digital part.

### Keeping files private

Digital files are stored in a **private** area, never a public link.
The website only ever generates a short-lived, one-time download link
at the moment a customer clicks Download — it is never possible for
someone to guess or share a permanent link to the raw file. You never
need to do anything extra to keep a file private; just don't share a
customer's personal download link or order number publicly.

### What not to do with digital products

- Do not set a digital product to Active before its file is uploaded —
  the website will stop you, but don't try to work around it.
- Do not remove a digital product's file while it is Active — set it to
  Draft or Archived first if you need to take the file down.
- Do not share a customer's download link or forward their confirmation
  email to anyone else.
- Do not invent a price or publish a digital product before its real
  file is ready.

## How to Update Stock

1. Open the product's Edit page.
2. Change the number in Stock Quantity to the correct amount.
3. Click Save Changes.

You can also set a Low Stock Threshold. This is just a number used for your own Dashboard warnings, it does not stop customers from ordering.

## How to View Orders

1. Go to Orders in the admin menu.
2. You will see a list of all orders, with order number, customer name, status and payment status.
3. Click on an order to see full details, including:
   - Customer name, email and phone number
   - Delivery address and any delivery notes
   - The products and quantities ordered
   - Delivery fee and order total
   - Payment method and payment status

## How to Update Order Status

1. Open an order from the Orders list.
2. Find the order status section.
3. Choose the next correct status for where the order actually is. The order status moves forward in this order:
   - Pending: order placed, not yet confirmed.
   - Confirmed: you have checked the order and it is ready to prepare.
   - Processing: you are packing the order.
   - Ready For Delivery: the order is packed and ready for a courier to collect.
   - Out For Delivery: the order is with the courier.
   - Delivered: the order has reached the customer.
4. You can also mark an order as Cancelled if needed, with a short note explaining why.
5. Click Save or Confirm to update the status.

Payment status is shown separately from order status, and updates on its own once a payment is confirmed. You do not need to, and cannot, change payment status by hand from this screen. This keeps payment records accurate and protected.

## How to Handle Manual Delivery

There is no live courier tracking system connected yet. Delivery works like this:

1. Once an order is Confirmed, prepare the items for delivery.
2. Book a courier yourself, using your own arrangement with a courier company.
3. Update the order status to Processing, then Ready For Delivery, then Out For Delivery, then Delivered, as the order moves along.
4. If you have a tracking number or waybill number from the courier, share it with the customer directly by email or WhatsApp, using the contact details on their order.

Delivery fees are already worked out automatically by the website: R80 standard delivery. Customers who are signed in to a registered account get free delivery automatically on orders of R500 or more — guests always pay the R80 fee, even on a large order. You do not need to calculate this yourself.

### About Automatic Courier Booking (not turned on yet)

The site now has the groundwork for the website to automatically book a courier with The Courier Guy the moment a customer's PayFast payment is confirmed, saving you the manual booking step above. **This is built but switched off** — nothing changes in how you handle delivery today. Please don't ask anyone to turn this on until it has been discussed and confirmed with whoever manages the technical side of the site, and please read that discussion carefully: once a real booking is made automatically, it cannot simply be undone by switching a setting back off — a wrong booking would need to be sorted out directly with Courier Guy.

## What Not to Touch

- Do not change a product's SKU or slug. These cannot be edited once set, and are not shown as editable fields for this reason.
- Do not try to change Payment Status by hand. It is protected and only updates through a confirmed payment.
- Do not delete a product. If a product should no longer be sold, set its status to Archived instead.
- Do not run any setup scripts or developer tools. If you see technical instructions you do not understand, stop and ask whoever manages the site for you before continuing.
- Do not turn on PayFast online payments yourself without first checking with whoever manages the technical side of the site, since this involves real payment settings.
- Do not turn on automatic courier booking yourself without first checking with whoever manages the technical side of the site — see "About Automatic Courier Booking" above.

## Never Share Passwords or Keys

- Never share your admin password with anyone, including an AI assistant, over chat, email or WhatsApp.
- Never share any "key," "secret," "token" or "credential" you may be shown or asked to add somewhere, such as a Supabase key or a PayFast merchant key. These should only ever be typed directly into the correct settings screen by you, never pasted into a chat conversation.
- If anyone, including a helper or assistant, asks you to paste a password or a key into a message, do not do it. Log in yourself, and only enter passwords and keys directly on the real login or settings screen.
- If you are ever unsure whether something is safe to share, treat it as private and ask first.
