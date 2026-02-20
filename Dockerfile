FROM python:3.11-slim

WORKDIR /app
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY zerobitch_fleet ./zerobitch_fleet
COPY config.yaml ./config.yaml

EXPOSE 8080

CMD ["python", "-m", "zerobitch_fleet"]
