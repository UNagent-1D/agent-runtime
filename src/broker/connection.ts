import amqplib, { type Channel, type ChannelModel } from 'amqplib';

const RABBITMQ_URL = process.env['RABBITMQ_URL'] ?? 'amqp://localhost:5672';
const QUEUES = ['chat_requests', 'chat_results'] as const;

let _channel: Channel | null = null;
let _connection: ChannelModel | null = null;

export async function getChannel(): Promise<Channel> {
  if (_channel) return _channel;

  const conn = await amqplib.connect(RABBITMQ_URL);
  _connection = conn;

  conn.on('close', () => {
    _channel = null;
    _connection = null;
    console.error('RabbitMQ connection closed — will reconnect on next call');
  });
  conn.on('error', (err: Error) => {
    console.error('RabbitMQ connection error:', err.message);
    _channel = null;
    _connection = null;
  });

  const ch = await conn.createChannel();
  for (const q of QUEUES) {
    await ch.assertQueue(q, { durable: true });
  }

  _channel = ch;
  return ch;
}
