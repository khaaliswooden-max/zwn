FROM python:3.11-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY src/ src/

ENV NN_SERVICE_PORT=5100
EXPOSE 5100

CMD ["python", "-m", "uvicorn", "src.api:app", "--host", "0.0.0.0", "--port", "5100"]
