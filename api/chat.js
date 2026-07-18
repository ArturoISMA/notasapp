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

  const endpoint = 'https://api.groq.ai/v1/completions';

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'groq2',
        prompt,
        max_tokens: 500,
        temperature: 0.2
      })
    });

    const responseText = await response.text();
    let responseData;

    try {
      responseData = JSON.parse(responseText);
    } catch (parseError) {
      console.error('Failed to parse Groq response:', parseError, responseText);
      return res.status(502).json({
        error: 'Invalid response from Groq API',
        details: responseText
      });
    }

    if (!response.ok) {
      console.error('Groq error:', response.status, responseData);
      return res.status(502).json({
        error: 'Error from Groq API',
        details: responseData
      });
    }

    const answer =
      responseData?.choices?.[0]?.message?.content ||
      responseData?.choices?.[0]?.text ||
      responseData?.output?.[0]?.content ||
      responseData?.output ||
      'No se obtuvo respuesta de Groq.';

    return res.status(200).json({ answer });
  } catch (error) {
    console.error('Chat API failure:', error);
    return res.status(500).json({
      error: 'Failed to query Groq API',
      details: error?.message || String(error)
    });
  }
}
