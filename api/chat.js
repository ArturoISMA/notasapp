const https = require('https');

const parseRequestBody = (req) => {
  return new Promise((resolve, reject) => {
    let data = '';

    req.on('data', (chunk) => {
      data += chunk;
    });

    req.on('end', () => {
      if (!data) {
        resolve(undefined);
        return;
      }

      try {
        resolve(JSON.parse(data));
      } catch (error) {
        reject(error);
      }
    });

    req.on('error', reject);
  });
};

const callGroq = (endpoint, apiKey, body) => {
  return new Promise((resolve, reject) => {
    const url = new URL(endpoint);
    const payload = JSON.stringify(body);

    const options = {
      hostname: url.hostname,
      path: url.pathname + url.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
        Authorization: `Bearer ${apiKey}`
      }
    };

    const request = https.request(options, (response) => {
      let responseData = '';
      response.on('data', (chunk) => {
        responseData += chunk;
      });
      response.on('end', () => {
        resolve({ status: response.statusCode, body: responseData });
      });
    });

    request.on('error', reject);
    request.write(payload);
    request.end();
  });
};

const parseIncomingBody = async (req) => {
  let body = req.body;

  if (body && typeof body === 'object' && Object.keys(body).length > 0) {
    return body;
  }

  if (typeof req.rawBody === 'string' && req.rawBody.trim()) {
    try {
      return JSON.parse(req.rawBody);
    } catch (parseError) {
      throw parseError;
    }
  }

  if (typeof body === 'string') {
    try {
      return JSON.parse(body);
    } catch (parseError) {
      throw parseError;
    }
  }

  try {
    return await parseRequestBody(req);
  } catch (parseError) {
    throw parseError;
  }
};

const handler = async (req, res) => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ error: 'Method not allowed' });
  }

  let body;
  try {
    body = await parseIncomingBody(req);
  } catch (parseError) {
    console.error('Failed to parse request body:', parseError);
    return res.status(400).json({ error: 'Invalid JSON body' });
  }

  const { question, notes } = body || {};

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
    const groqResponse = await callGroq(endpoint, apiKey, {
      model: 'groq2',
      prompt,
      max_tokens: 500,
      temperature: 0.2
    });

    const responseText = groqResponse.body;
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

    if (groqResponse.status < 200 || groqResponse.status >= 300) {
      console.error('Groq error:', groqResponse.status, responseData);
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
};

module.exports = handler;
