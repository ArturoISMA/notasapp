export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { question, notes } = req.body || {};

  if (!question || !Array.isArray(notes)) {
    return res.status(400).json({ error: 'Question and notes are required' });
  }

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'GROQ_API_KEY is not configured' });
  }

  const noteText = notes
    .map((note, index) => `Nota ${index + 1}: ${note.titulo} (${note.categoria || 'General'})\n${note.contenido}`)
    .join('\n\n');

  const prompt = `Eres un asistente que responde preguntas usando solamente la información de las notas proporcionadas.\n\nNotas:\n${noteText}\n\nPregunta: ${question}\n\nRespuesta:`;

  async function getFetch() {
    if (typeof fetch !== 'undefined') {
      return fetch;
    }

    try {
      const { default: nodeFetch } = await import('node-fetch');
      return nodeFetch;
    } catch (fetchError) {
      throw new Error('Fetch is not available in this environment');
    }
  }

  const fetchClient = await getFetch();
  const endpoints = [
    'https://api.groq.ai/v1/completions',
    'https://api.groq.ai/v1/chat/completions'
  ];

  let lastError;

  for (const endpoint of endpoints) {
    try {
      const response = await fetchClient(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`
        },
        body: JSON.stringify(
          endpoint.endsWith('/chat/completions')
            ? {
                model: 'groq2',
                messages: [
                  { role: 'system', content: 'Eres un asistente que responde usando únicamente la información dada.' },
                  { role: 'user', content: prompt }
                ],
                max_tokens: 500,
                temperature: 0.2
              }
            : {
                model: 'groq2',
                prompt,
                max_tokens: 500,
                temperature: 0.2
              }
        )
      });

      const responseText = await response.text();
      let responseData;

      try {
        responseData = JSON.parse(responseText);
      } catch (parseError) {
        console.error('Failed to parse Groq response from', endpoint, parseError, responseText);
        lastError = { endpoint, status: response.status, body: responseText };
        continue;
      }

      if (!response.ok) {
        console.error('Groq error from', endpoint, response.status, responseData);
        lastError = { endpoint, status: response.status, body: responseData };
        continue;
      }

      const answer =
        responseData?.choices?.[0]?.message?.content ||
        responseData?.choices?.[0]?.text ||
        responseData?.output?.[0]?.content ||
        responseData?.output ||
        'No se obtuvo respuesta de Groq.';

      return res.status(200).json({ answer });
    } catch (error) {
      console.error('Groq request failed for', endpoint, error);
      lastError = { endpoint, error: error?.message || String(error) };
    }
  }

  return res.status(502).json({
    error: 'Failed to query Groq API',
    details: lastError
  });
}
