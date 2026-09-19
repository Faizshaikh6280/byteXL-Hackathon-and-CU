FROM python:3.10-slim

WORKDIR /app

# Copy requirements and install precompiled dependencies
COPY requirements.txt .
RUN pip install --default-timeout=1000 -r requirements.txt

# Copy backend source
COPY . .

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
