const crypto = require("node:crypto");

async function blobApi() {
  return import("@vercel/blob");
}

function orderPath(orderId) {
  return `orders/${orderId}.json`;
}

async function putPrivate(pathname, body, contentType) {
  const { put } = await blobApi();
  return put(pathname, body, {
    access: "private",
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType,
    cacheControlMaxAge: 60,
  });
}

async function saveOrder(order) {
  await putPrivate(orderPath(order.orderId), JSON.stringify(order), "application/json");
  return order;
}

async function saveNewOrder(order, files) {
  const storedFiles = [];
  for (const file of files || []) {
    const safeName = file.name.replace(/[^A-Za-z0-9._-]+/g, "-").slice(0, 100) || "attachment";
    const pathname = `orders/${order.orderId}/attachments/${crypto.randomBytes(5).toString("hex")}-${safeName}`;
    await putPrivate(pathname, file.buffer, file.type);
    storedFiles.push({ pathname, name: file.name, type: file.type, size: file.buffer.length });
  }
  return saveOrder({ ...order, files: storedFiles });
}

async function saveReport(orderId, file) {
  const pathname = `orders/${orderId}/report/final-report.pdf`;
  await putPrivate(pathname, file.buffer, "application/pdf");
  return { pathname, name: file.name, type: "application/pdf", size: file.buffer.length, sha256: file.sha256, uploadedAt: new Date().toISOString() };
}

async function streamText(stream) {
  return new Response(stream).text();
}

async function getOrder(orderId) {
  const { get } = await blobApi();
  const result = await get(orderPath(orderId), { access: "private", useCache: false });
  if (!result || result.statusCode !== 200) return null;
  return JSON.parse(await streamText(result.stream));
}

async function listOrders() {
  const { list } = await blobApi();
  const result = await list({ prefix: "orders/", limit: 1000 });
  const paths = result.blobs.map((blob) => blob.pathname).filter((pathname) => /^orders\/VRD-[^/]+\.json$/.test(pathname));
  const orders = (await Promise.all(paths.map((pathname) => getOrder(pathname.slice(7, -5))))).filter(Boolean);
  return orders.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}

async function getPrivateFile(pathname) {
  const { get } = await blobApi();
  return get(pathname, { access: "private", useCache: false });
}

async function getPrivateBuffer(pathname) {
  const result = await getPrivateFile(pathname);
  if (!result || result.statusCode !== 200) return null;
  return Buffer.from(await new Response(result.stream).arrayBuffer());
}

module.exports = { saveOrder, saveNewOrder, saveReport, getOrder, listOrders, getPrivateFile, getPrivateBuffer };
