const BASE = 'https://mitsattendance.onrender.com';

export interface Subject {
  name: string;
  attended: number;
  total: number;
  percentage: number;
  canSkip: number;
  required: number;
}

export interface Overall {
  percentage: number;
  attended: number;
  total: number;
  canSkip?: number;
  required?: number;
}

export interface AttendanceData {
  overall: Overall;
  subjects: Subject[];
  telegram?: { subscribed: boolean; chat_id?: string };
}

export interface ApiResult<T = AttendanceData> {
  status: 'success' | 'error';
  data?: T;
  message?: string;
}

async function post<T>(path: string, body: object): Promise<ApiResult<T>> {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return res.json();
}

export const fetchAttendance = (roll: string, password: string) =>
  post<AttendanceData>('/api/attendance', { roll, password });

export const telegramSubscribe = (roll: string, password: string, chat_id: string) =>
  post('/api/telegram-subscribe', { roll, password, chat_id });

export const telegramUnsubscribe = (roll: string) =>
  post('/api/telegram-unsubscribe', { roll });

export const sendNow = (roll: string, password: string) =>
  post('/api/send-now', { roll, password });
