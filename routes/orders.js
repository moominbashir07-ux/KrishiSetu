const express = require('express');
const db = require('../db/db');
const { authenticateUser, requireRole, requireAnyRole } = require('../middleware/auth');

const router = express.Router();

let orderCounter = Math.floor(Date.now() / 1000) % 900000 + 100000;

function generateOrderNumber() {
  orderCounter += 1;
  const rand = Math.floor(100 + Math.random() * 900);
  return `KS-2026-${orderCounter}-${rand}`;
}

const ALLOWED_TRANSITIONS = {
  'Order Placed': ['Farmer Confirmed', 'Preparing', 'Cancelled', 'Rejected'],
  'Farmer Confirmed': ['Preparing', 'Cancelled', 'Rejected'],
  'Preparing': ['Ready', 'Cancelled'],
  'Ready': ['Completed', 'Cancelled'],
  'Completed': [],
  'Cancelled': [],
  'Rejected': []
};

const STATUS_TO_STEP = {
  'Order Placed': 1,
  'Farmer Confirmed': 2,
  'Preparing': 3,
  'Ready': 4,
  'Completed': 5,
  'Cancelled': 5,
  'Rejected': 5
};

// CREATE ORDER (DIRECT OR CART CHECKOUT)
router.post('/', authenticateUser, requireRole('customer'), async (req, res, next) => {
  const { productId, quantity, payment_method = 'cod', payment_status, transaction_id, transactionId } = req.body;
  const customerId = req.user.id;
  const buyerContact = req.user.contact;

  const cleanTxnId = (transaction_id || transactionId || '').trim() || null;
  if (cleanTxnId) {
    if (cleanTxnId.length < 5 || cleanTxnId.length > 100) {
      return res.status(400).json({ error: 'A valid Transaction ID (between 5 and 100 characters) is required.' });
    }

    const dupCheck = await db.query(
      "SELECT id, order_number FROM orders WHERE LOWER(transaction_id) = LOWER($1) AND payment_status != 'rejected'",
      [cleanTxnId]
    );
    if (dupCheck.rows.length > 0) {
      return res.status(409).json({
        error: `This Transaction ID has already been submitted for Order #${dupCheck.rows[0].order_number || dupCheck.rows[0].id}. Each payment requires a unique Transaction ID.`
      });
    }
  }

  const validPayStatus = payment_status || (payment_method === 'upi_qr' ? 'submitted' : 'cod');

  try {
    let orderItemsToProcess = [];

    if (productId) {
      const numQty = Number(quantity || 1);
      if (!Number.isFinite(numQty) || numQty <= 0) {
        return res.status(400).json({ error: 'Order quantity must be a positive number.' });
      }
      orderItemsToProcess.push({ productId, quantity: numQty });
    } else {
      const cartResult = await db.query('SELECT id FROM carts WHERE customer_id = $1', [customerId]);
      if (!cartResult.rows.length) {
        return res.status(400).json({ error: 'Your cart is empty.' });
      }

      const cartId = cartResult.rows[0].id;
      const itemsResult = await db.query(
        'SELECT product_id as "productId", quantity FROM cart_items WHERE cart_id = $1',
        [cartId]
      );

      if (!itemsResult.rows.length) {
        return res.status(400).json({ error: 'Your cart is empty. Add products before placing an order.' });
      }

      orderItemsToProcess = itemsResult.rows.map(item => ({
        productId: item.productId,
        quantity: Number(item.quantity)
      }));
    }

    const createdOrders = await db.withTransaction(async (client) => {
      const sellerGroups = {};

      for (const item of orderItemsToProcess) {
        const prodRes = await client.query(
          'SELECT id, seller_id, name, price, quantity, status FROM products WHERE id = $1 FOR UPDATE',
          [item.productId]
        );

        if (!prodRes.rows.length) {
          const err = new Error(`Product ${item.productId} not found.`);
          err.statusCode = 400;
          throw err;
        }

        const product = prodRes.rows[0];
        if (product.status === 'inactive') {
          const err = new Error(`Product "${product.name}" is no longer available.`);
          err.statusCode = 400;
          throw err;
        }

        const availableQty = Number(product.quantity);
        const requestedQty = Number(item.quantity);

        if (requestedQty <= 0) {
          const err = new Error(`Invalid requested quantity for "${product.name}".`);
          err.statusCode = 400;
          throw err;
        }

        if (requestedQty > availableQty) {
          const err = new Error(`Insufficient stock for product "${product.name}". Requested: ${requestedQty} kg, Available: ${availableQty} kg.`);
          err.statusCode = 400;
          throw err;
        }

        const unitPrice = Number(product.price);
        const subtotal = requestedQty * unitPrice;
        const sellerId = product.seller_id;

        if (!sellerGroups[sellerId]) {
          sellerGroups[sellerId] = [];
        }

        sellerGroups[sellerId].push({ product, requestedQty, unitPrice, subtotal });
      }

      const ordersList = [];

      for (const [sellerId, items] of Object.entries(sellerGroups)) {
        const orderId = 'ORD_' + Date.now() + Math.random().toString(36).substring(2, 6);
        const orderNumber = generateOrderNumber();
        const sellerSubtotal = items.reduce((sum, i) => sum + i.subtotal, 0);
        const sellerQty = items.reduce((sum, i) => sum + i.requestedQty, 0);
        const isBulk = sellerSubtotal >= 5000 || sellerQty >= 100;
        const feeRate = isBulk ? 0.005 : 0.02;
        const platformFee = Math.round(sellerSubtotal * feeRate * 100) / 100;
        const sellerTotal = Math.round((sellerSubtotal + platformFee) * 100) / 100;

        await client.query(
          `INSERT INTO orders (id, order_number, customer_id, seller_id, status, total_amount, platform_fee, buyer_contact, step, payment_method, payment_status, transaction_id)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
          [orderId, orderNumber, customerId, sellerId, 'Order Placed', sellerTotal, platformFee, buyerContact, 1, payment_method, validPayStatus, cleanTxnId]
        );

        // Record initial status history log
        const historyId = 'OSH_' + Date.now() + Math.random().toString(36).substring(2, 5);
        await client.query(
          `INSERT INTO order_status_history (id, order_id, previous_status, new_status, changed_by)
           VALUES ($1, $2, $3, $4, $5)`,
          [historyId, orderId, null, 'Order Placed', customerId]
        );

        // Send notification to Seller
        const notifId = 'NOTIF_' + Date.now() + Math.random().toString(36).substring(2, 6);
        await client.query(
          `INSERT INTO notifications (id, user_id, type, title, message, read, order_id)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [
            notifId, sellerId, 'new_order',
            `🔔 New Order Received #${orderNumber}`,
            `You received a new order for ${items[0].product.name} (${items[0].requestedQty} kg). Total: ₹${sellerTotal}`,
            false, orderId
          ]
        );

        for (const item of items) {
          const orderItemId = 'OI_' + Date.now() + Math.random().toString(36).substring(2, 6);
          await client.query(
            `INSERT INTO order_items (id, order_id, product_id, product_name_snapshot, quantity, unit_price_snapshot, unit, subtotal)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
            [orderItemId, orderId, item.product.id, item.product.name, item.requestedQty, item.unitPrice, 'kg', item.subtotal]
          );

          const newQty = Number(item.product.quantity) - item.requestedQty;
          const newStatus = newQty === 0 ? 'out_of_stock' : 'active';

          await client.query(
            'UPDATE products SET quantity = $1, status = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3',
            [newQty, newStatus, item.product.id]
          );
        }

        const sellerRes = await client.query('SELECT name, contact FROM users WHERE id = $1', [sellerId]);
        const spRes = await client.query('SELECT verification_status FROM seller_profiles WHERE user_id = $1', [sellerId]);
        const seller = sellerRes.rows[0] || {};
        const sp = spRes.rows[0] || {};

        ordersList.push({
          id: orderNumber,
          internalId: orderId,
          order_number: orderNumber,
          customer_id: customerId,
          seller_id: sellerId,
          status: 'Order Placed',
          step: 1,
          total: sellerTotal,
          payment_method: payment_method,
          payment_status: validPayStatus,
          transaction_id: cleanTxnId,
          transactionId: cleanTxnId,
          product: items[0].product.name,
          qty: items[0].requestedQty,
          price: items[0].unitPrice,
          sellerName: seller.name || 'Local Farmer',
          sellerContact: seller.contact || 'Contact pending',
          sellerVerificationStatus: sp.verification_status || 'pending',
          sellerLocation: 'Location pending',
          createdAt: new Date().toLocaleString()
        });
      }

      if (!productId) {
        const cartRes = await client.query('SELECT id FROM carts WHERE customer_id = $1', [customerId]);
        if (cartRes.rows.length) {
          await client.query('DELETE FROM cart_items WHERE cart_id = $1', [cartRes.rows[0].id]);
        }
      }

      return ordersList;
    });

    res.status(201).json({
      message: 'Order placed successfully.',
      orders: createdOrders
    });
  } catch (err) {
    next(err);
  }
});

// GET USER ORDERS (SELLER, CUSTOMER, OR ADMIN WITH STRICT IDOR PROTECTION)
router.get('/', authenticateUser, async (req, res, next) => {
  try {
    const userId = req.user.id;
    const role = req.user.role;

    let queryText = '';
    let params = [];

    const fields = `
      o.id, o.order_number, o.status, o.step, o.total_amount as total, o.buyer_contact, o.created_at, o.customer_id, o.seller_id,
      o.payment_method, o.payment_status, o.transaction_id,
      su.name as "sellerName", su.contact as "sellerContact", COALESCE(sp.verification_status, 'pending') as "sellerVerificationStatus",
      cu.name as "customerName", cu.contact as "customerEmail", cu.phone as "customerPhone",
      cp.address as "customerAddress", cp.city as "customerCity", cp.state as "customerState", cp.pincode as "customerPincode"
    `;

    if (role === 'admin') {
      queryText = `
        SELECT ${fields}
        FROM orders o
        JOIN users su ON o.seller_id = su.id
        LEFT JOIN seller_profiles sp ON o.seller_id = sp.user_id
        LEFT JOIN users cu ON o.customer_id = cu.id
        LEFT JOIN customer_profiles cp ON o.customer_id = cp.user_id
        ORDER BY o.created_at DESC
      `;
    } else if (role === 'seller') {
      params = [userId];
      queryText = `
        SELECT ${fields}
        FROM orders o
        JOIN users su ON o.seller_id = su.id
        LEFT JOIN seller_profiles sp ON o.seller_id = sp.user_id
        LEFT JOIN users cu ON o.customer_id = cu.id
        LEFT JOIN customer_profiles cp ON o.customer_id = cp.user_id
        WHERE o.seller_id = $1
        ORDER BY o.created_at DESC
      `;
    } else {
      params = [userId];
      queryText = `
        SELECT ${fields}
        FROM orders o
        JOIN users su ON o.seller_id = su.id
        LEFT JOIN seller_profiles sp ON o.seller_id = sp.user_id
        LEFT JOIN users cu ON o.customer_id = cu.id
        LEFT JOIN customer_profiles cp ON o.customer_id = cp.user_id
        WHERE o.customer_id = $1
        ORDER BY o.created_at DESC
      `;
    }

    const result = await db.query(queryText, params);
    const orders = [];

    for (const orderRow of result.rows) {
      const itemsRes = await db.query(
        'SELECT product_name_snapshot, quantity, unit_price_snapshot, subtotal FROM order_items WHERE order_id = $1',
        [orderRow.id]
      );

      const items = (itemsRes.rows || []).map(i => ({
        name: i.product_name_snapshot,
        quantity: Number(i.quantity),
        unitPrice: Number(i.unit_price_snapshot),
        subtotal: Number(i.subtotal)
      }));

      const firstItem = items[0] || {};
      const subtotalSum = items.reduce((sum, i) => sum + i.subtotal, 0);
      const totalAmount = Number(orderRow.total || 0);
      const platformFee = Math.max(0, Math.round((totalAmount - subtotalSum) * 100) / 100);

      let deliveryAddr = orderRow.customerAddress;
      if (orderRow.customerCity) deliveryAddr += `, ${orderRow.customerCity}`;
      if (orderRow.customerState) deliveryAddr += `, ${orderRow.customerState}`;
      if (orderRow.customerPincode) deliveryAddr += ` - ${orderRow.customerPincode}`;
      if (!deliveryAddr) deliveryAddr = orderRow.buyer_contact || 'Delivery address provided at checkout';

      orders.push({
        id: orderRow.order_number || orderRow.id,
        dbId: orderRow.id,
        orderNumber: orderRow.order_number || orderRow.id,
        customer_id: orderRow.customer_id,
        seller_id: orderRow.seller_id,
        customerName: orderRow.customerName || 'Customer',
        customerEmail: orderRow.customerEmail || 'Contact not provided',
        customerPhone: orderRow.customerPhone || orderRow.customerEmail || 'Contact not provided',
        deliveryAddress: deliveryAddr,
        items,
        product: firstItem.name || 'Product',
        qty: firstItem.quantity || 1,
        price: firstItem.unitPrice || totalAmount,
        subtotal: subtotalSum,
        platformFee,
        total: totalAmount,
        payment_method: orderRow.payment_method || 'cod',
        payment_status: orderRow.payment_status || 'pending',
        transaction_id: orderRow.transaction_id || null,
        transactionId: orderRow.transaction_id || null,
        status: orderRow.status,
        step: Number(orderRow.step || 1),
        sellerName: orderRow.sellerName || 'Local Farmer',
        sellerContact: orderRow.sellerContact || 'Contact not provided',
        sellerVerificationStatus: orderRow.sellerVerificationStatus || 'pending',
        sellerLocation: 'Location pending',
        createdAt: new Date(orderRow.created_at).toLocaleString()
      });
    }

    res.json({ orders });
  } catch (err) {
    next(err);
  }
});

// GET SINGLE ORDER DETAILS WITH STRICT IDOR AUTHORIZATION
router.get('/:id', authenticateUser, async (req, res, next) => {
  const orderIdentifier = req.params.id;

  try {
    const orderRes = await db.query(
      `SELECT o.*, u.name as "sellerName", u.contact as "sellerContact", COALESCE(sp.verification_status, 'pending') as "sellerVerificationStatus"
       FROM orders o
       JOIN users u ON o.seller_id = u.id
       LEFT JOIN seller_profiles sp ON o.seller_id = sp.user_id
       WHERE o.id = $1 OR o.order_number = $1`,
      [orderIdentifier]
    );

    if (!orderRes.rows.length) {
      return res.status(404).json({ error: 'Order not found.' });
    }

    const order = orderRes.rows[0];

    // IDOR Protection: User must be customer, seller, or admin
    if (order.customer_id !== req.user.id && order.seller_id !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Forbidden. You do not have permission to view this order.' });
    }

    const itemsRes = await db.query('SELECT * FROM order_items WHERE order_id = $1', [order.id]);
    const historyRes = await db.query('SELECT * FROM order_status_history WHERE order_id = $1 ORDER BY changed_at ASC', [order.id]);

    res.json({
      order: {
        ...order,
        items: itemsRes.rows,
        history: historyRes.rows
      }
    });
  } catch (err) {
    next(err);
  }
});

// UPDATE ORDER STATUS (HARDENED STATE MACHINE & IDOR PROTECTION)
router.put('/:id/status', authenticateUser, requireAnyRole('seller', 'admin'), async (req, res, next) => {
  const { status, step } = req.body;
  const orderIdentifier = req.params.id;

  try {
    const orderRes = await db.query(
      'SELECT id, seller_id, customer_id, status, step FROM orders WHERE id = $1 OR order_number = $1',
      [orderIdentifier]
    );

    if (!orderRes.rows.length) {
      return res.status(404).json({ error: 'Order not found.' });
    }

    const order = orderRes.rows[0];

    // IDOR Protection: Sellers can only modify orders assigned to them; Admin can modify any order
    if (req.user.role === 'seller' && order.seller_id !== req.user.id) {
      return res.status(403).json({ error: 'Forbidden. You can only update status for orders placed with you.' });
    }

    const currentStatus = order.status || 'Order Placed';
    let targetStatus = status;

    if (!targetStatus && step !== undefined) {
      if (typeof step === 'string' && isNaN(Number(step))) {
        targetStatus = step;
      } else {
        const stepNum = Number(step);
        const stepMap = { 1: 'Order Placed', 2: 'Farmer Confirmed', 3: 'Preparing', 4: 'Ready', 5: 'Completed' };
        targetStatus = stepMap[stepNum];
      }
    }

    if (!targetStatus) {
      return res.status(400).json({ error: 'Target status is required.' });
    }

    // STATE MACHINE HARDENING: Validate allowed transition
    const allowedNextStatuses = ALLOWED_TRANSITIONS[currentStatus] || [];
    if (!allowedNextStatuses.includes(targetStatus)) {
      return res.status(400).json({ 
        error: `Invalid status transition from "${currentStatus}" to "${targetStatus}". Allowed next states: [${allowedNextStatuses.join(', ')}].` 
      });
    }

    const newStep = STATUS_TO_STEP[targetStatus] || 5;

    await db.withTransaction(async (client) => {
      await client.query(
        'UPDATE orders SET status = $1, step = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3',
        [targetStatus, newStep, order.id]
      );

      // Record state history log safely
      try {
        const historyId = 'OSH_' + Date.now() + Math.random().toString(36).substring(2, 5);
        await client.query(
          `INSERT INTO order_status_history (id, order_id, previous_status, new_status, changed_by)
           VALUES ($1, $2, $3, $4, $5)`,
          [historyId, order.id, currentStatus, targetStatus, req.user.id]
        );
      } catch (hErr) {
        console.warn('[ORDER HISTORY WARNING]', hErr.message);
      }

      // Send notification to Customer safely
      try {
        const notifId = 'NOTIF_' + Date.now() + Math.random().toString(36).substring(2, 6);
        let notifTitle = `📦 Order Update #${order.order_number || order.id}`;
        let notifMsg = `Your order #${order.order_number || order.id} status has been updated to "${targetStatus}".`;

        if (targetStatus === 'Farmer Confirmed') {
          notifTitle = `✅ Order Confirmed #${order.order_number || order.id}`;
          notifMsg = `Your order #${order.order_number || order.id} has been confirmed by the seller.`;
        } else if (targetStatus === 'Preparing') {
          notifTitle = `📦 Order Preparing #${order.order_number || order.id}`;
          notifMsg = `Your order #${order.order_number || order.id} is being prepared.`;
        } else if (targetStatus === 'Ready') {
          notifTitle = `📦 Order Ready #${order.order_number || order.id}`;
          notifMsg = `Your order #${order.order_number || order.id} is ready.`;
        } else if (targetStatus === 'Delivered' || targetStatus === 'Completed') {
          notifTitle = `🎉 Order Delivered #${order.order_number || order.id}`;
          notifMsg = `Your order #${order.order_number || order.id} has been delivered.`;
        }

        await client.query(
          `INSERT INTO notifications (id, user_id, type, title, message, read, order_id)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [notifId, order.customer_id, 'order_status', notifTitle, notifMsg, false, order.id]
        );
      } catch (nErr) {
        console.warn('[CUSTOMER NOTIFICATION WARNING]', nErr.message);
      }
    });

    res.json({
      message: `Order ${orderIdentifier} status updated to ${targetStatus}`,
      orderId: orderIdentifier,
      previousStatus: currentStatus,
      status: targetStatus,
      step: newStep
    });
  } catch (err) {
    next(err);
  }
});

// CUSTOMER SUBMIT ONLINE PAYMENT VERIFICATION (REQUIRES MANDATORY TRANSACTION ID & REPLAY PROTECTION)
router.post('/:id/verify-payment', authenticateUser, requireRole('customer'), async (req, res, next) => {
  const { transactionId } = req.body;
  const orderIdentifier = req.params.id;

  if (!transactionId || typeof transactionId !== 'string' || !transactionId.trim() || transactionId.trim().length < 5 || transactionId.trim().length > 100) {
    return res.status(400).json({ error: 'A valid Transaction ID (between 5 and 100 characters) is required to submit payment verification.' });
  }

  const cleanTxnId = transactionId.trim();

  try {
    const orderRes = await db.query(
      'SELECT id, order_number, customer_id, seller_id, total_amount, payment_status FROM orders WHERE id = $1 OR order_number = $1',
      [orderIdentifier]
    );

    if (!orderRes.rows.length) {
      return res.status(404).json({ error: 'Order not found.' });
    }

    const order = orderRes.rows[0];

    // IDOR Protection: Must be the customer who placed the order
    if (order.customer_id !== req.user.id) {
      return res.status(403).json({ error: 'Forbidden. You can only submit payment verification for your own orders.' });
    }

    // Payment Security: Check for duplicate transaction ID replay across orders
    const dupCheck = await db.query(
      'SELECT id, order_number FROM orders WHERE LOWER(transaction_id) = LOWER($1) AND id != $2 AND payment_status != \'rejected\'',
      [cleanTxnId, order.id]
    );

    if (dupCheck.rows.length > 0) {
      return res.status(409).json({
        error: `This Transaction ID has already been submitted for Order #${dupCheck.rows[0].order_number || dupCheck.rows[0].id}. Each payment requires a unique Transaction ID.`
      });
    }

    await db.query(
      'UPDATE orders SET payment_status = $1, transaction_id = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3',
      ['submitted', cleanTxnId, order.id]
    );

    // Send notification to Seller that payment verification is required
    const notifId = 'NOTIF_' + Date.now() + Math.random().toString(36).substring(2, 6);
    await db.query(
      `INSERT INTO notifications (id, user_id, type, title, message, read, order_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        notifId, order.seller_id, 'payment_verification_required',
        `💳 Payment Verification Required #${order.order_number || order.id}`,
        `Customer submitted payment verification (Txn ID: ${cleanTxnId}) for Order #${order.order_number || order.id} (₹${order.total_amount}). Please verify.`,
        false, order.id
      ]
    ).catch(e => console.warn('Payment notification warn:', e.message));

    res.json({
      message: 'Payment verification submitted. Waiting for seller confirmation.',
      orderId: order.id,
      transactionId: cleanTxnId,
      paymentStatus: 'submitted'
    });
  } catch (err) {
    next(err);
  }
});

// SELLER VERIFY OR REJECT ONLINE PAYMENT (STRICT STATE MACHINE ENFORCEMENT)
router.put('/:id/seller-verify-payment', authenticateUser, requireAnyRole('seller', 'admin'), async (req, res, next) => {
  const { action, reason } = req.body;
  const orderIdentifier = req.params.id;

  if (!['approve', 'reject'].includes(action)) {
    return res.status(400).json({ error: "Action must be either 'approve' or 'reject'." });
  }

  try {
    const orderRes = await db.query(
      'SELECT id, order_number, customer_id, seller_id, total_amount, transaction_id, payment_status, status FROM orders WHERE id = $1 OR order_number = $1',
      [orderIdentifier]
    );

    if (!orderRes.rows.length) {
      return res.status(404).json({ error: 'Order not found.' });
    }

    const order = orderRes.rows[0];

    // IDOR Protection: Seller must own the order (unless admin override)
    if (req.user.role === 'seller' && order.seller_id !== req.user.id) {
      return res.status(403).json({ error: 'Forbidden. You can only verify payments for orders placed with your farm.' });
    }

    // STATE MACHINE VALIDATION: Prevent invalid payment transitions
    if (order.payment_status === 'verified') {
      return res.status(409).json({ error: 'Payment for this order has already been verified and confirmed.' });
    }

    if (order.payment_status !== 'submitted' && req.user.role !== 'admin') {
      return res.status(400).json({ 
        error: `Cannot verify payment with status '${order.payment_status}'. Payment must be in 'submitted' state.` 
      });
    }

    if (action === 'approve') {
      await db.query(
        "UPDATE orders SET payment_status = 'verified', status = 'Farmer Confirmed', step = 2, updated_at = CURRENT_TIMESTAMP WHERE id = $1",
        [order.id]
      );

      // Record state history
      const historyId = 'OSH_' + Date.now() + Math.random().toString(36).substring(2, 5);
      await db.query(
        `INSERT INTO order_status_history (id, order_id, previous_status, new_status, changed_by)
         VALUES ($1, $2, $3, $4, $5)`,
        [historyId, order.id, order.status, 'Farmer Confirmed', req.user.id]
      ).catch(() => {});

      // Send notification to customer
      const notifId = 'NOTIF_' + Date.now() + Math.random().toString(36).substring(2, 6);
      await db.query(
        `INSERT INTO notifications (id, user_id, type, title, message, read, order_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          notifId, order.customer_id, 'payment_verified',
          `✅ Payment Verified #${order.order_number || order.id}`,
          `Your payment (Txn ID: ${order.transaction_id || 'N/A'}) has been verified by the seller. Order is now Confirmed!`,
          false, order.id
        ]
      ).catch(() => {});

      res.json({
        message: `Payment verified and order #${order.order_number || order.id} confirmed.`,
        orderId: order.id,
        paymentStatus: 'verified',
        status: 'Farmer Confirmed'
      });
    } else {
      await db.query(
        "UPDATE orders SET payment_status = 'rejected', updated_at = CURRENT_TIMESTAMP WHERE id = $1",
        [order.id]
      );

      const failReason = reason ? `Reason: ${reason}` : 'Seller was unable to locate matching transaction.';
      const notifId = 'NOTIF_' + Date.now() + Math.random().toString(36).substring(2, 6);
      await db.query(
        `INSERT INTO notifications (id, user_id, type, title, message, read, order_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          notifId, order.customer_id, 'payment_failed',
          `⚠️ Payment Verification Failed #${order.order_number || order.id}`,
          `Payment could not be verified for Order #${order.order_number || order.id} (Txn ID: ${order.transaction_id || 'N/A'}). ${failReason}`,
          false, order.id
        ]
      ).catch(() => {});

      res.json({
        message: `Payment marked as rejected for order #${order.order_number || order.id}.`,
        orderId: order.id,
        paymentStatus: 'rejected',
        reason: reason || null
      });
    }
  } catch (err) {
    next(err);
  }
});

module.exports = router;
