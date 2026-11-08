import { Email } from './models/Email.js';

export const repository = {
  async create(data) {
    return Email.create(data);
  },
  async findByRequestId(requestId) {
    return Email.findOne({ requestId }).lean();
  },
  async findById(id) {
    return Email.findById(id).lean();
  },
  async addDelivery(id, delivery) {
    return Email.updateOne(
      { _id: id },
      {
        $push: { deliveries: delivery },
        $inc: {
          sentCount: delivery.status === 'sent' ? 1 : 0,
          failedCount: delivery.status === 'failed' ? 1 : 0,
        },
      },
    );
  },
  async finish(id, status) {
    return Email.findByIdAndUpdate(
      id,
      { status, completedAt: new Date() },
      { returnDocument: 'after' },
    ).lean();
  },
  async list({ search, status, page, limit }) {
    const filter = {};
    if (status) filter.status = status;
    if (search) {
      const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      filter.$or = [
        { subject: { $regex: escaped, $options: 'i' } },
        { recipients: { $regex: escaped, $options: 'i' } },
      ];
    }
    const [records, total] = await Promise.all([
      Email.find(filter)
        .select('-body -deliveries -requestId')
        .sort({ createdAt: -1, _id: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      Email.countDocuments(filter),
    ]);
    return { records, total, page, pages: Math.ceil(total / limit) };
  },
  async stats() {
    const [stats] = await Email.aggregate([
      {
        $group: {
          _id: null,
          campaigns: { $sum: 1 },
          sent: { $sum: '$sentCount' },
          failed: { $sum: '$failedCount' },
          previewed: {
            $sum: { $cond: [{ $eq: ['$status', 'previewed'] }, { $size: '$recipients' }, 0] },
          },
        },
      },
    ]);
    return stats || { campaigns: 0, sent: 0, failed: 0, previewed: 0 };
  },
};
