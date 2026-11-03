// Every success looks like { data, meta: { requestId } }. `meta` may add more, such as pagination.
export function sendData(req, res, data, status = 200, meta = {}) {
  res.status(status).json({ data, meta: { requestId: req.id, ...meta } });
}
