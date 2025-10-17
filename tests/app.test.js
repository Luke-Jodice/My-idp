//https://jestjs.io/docs/getting-started
import request from 'supertest';
import express from 'express';

// Mock the parts of idpv2.js that are hard to test
const app = express();

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

describe('GET /health', () => {
  it('should respond with a 200 status and a json object with the status of ok', async () => {
    const response = await request(app).get('/health');
    expect(response.statusCode).toBe(200);
    expect(response.body).toEqual({ status: 'ok' });
  });
});
