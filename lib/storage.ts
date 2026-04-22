import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const isWeb = Platform.OS === 'web';

async function set(key: string, value: string) {
  if (isWeb) { localStorage.setItem(key, value); }
  else { await SecureStore.setItemAsync(key, value); }
}

async function get(key: string): Promise<string | null> {
  if (isWeb) return localStorage.getItem(key);
  return SecureStore.getItemAsync(key);
}

async function del(key: string) {
  if (isWeb) { localStorage.removeItem(key); }
  else { await SecureStore.deleteItemAsync(key); }
}

export async function saveCredentials(roll: string, password: string) {
  await set('mits_roll', roll);
  await set('mits_password', password);
}

export async function getCredentials(): Promise<{ roll: string; password: string } | null> {
  try {
    const roll = await get('mits_roll');
    const password = await get('mits_password');
    if (roll && password) return { roll, password };
    return null;
  } catch {
    return null;
  }
}

export async function clearCredentials() {
  await del('mits_roll');
  await del('mits_password');
}

export async function saveChatId(chatId: string) {
  await set('mits_chat_id', chatId);
}

export async function getChatId(): Promise<string | null> {
  try { return await get('mits_chat_id'); }
  catch { return null; }
}

export async function clearChatId() {
  await del('mits_chat_id');
}
