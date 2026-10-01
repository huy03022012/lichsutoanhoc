const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api';
export async function chatWithAI(message) {
  const response = await fetch(`${API_BASE_URL}/ai/chat`, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({message}) });
  if (!response.ok) throw new Error('Không thể kết nối AI backend.');
  return response.json();
}
