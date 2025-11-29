## DhanX AI – Setup Guide

Simple steps to run the project locally.

### 1. Clone the repository

```bash
git clone <your-repo-url>
cd DhanX_AI
```

### 2. Frontend setup

```bash
cd frontend
npm install
npm start
```

### 3. Backend setup

In a new terminal:

```bash
cd backend
pip install -r requirements.txt
python main.py
```

### 4. Environment variables

Use these **example values** to create your `.env` files, then **change them as per your own environment** (database name, passwords, hosts, etc.).

Create a `.env` file in the `backend` folder, for example:

```env
DB_ENGINE=postgresql
DB_NAME=dhanx
DB_USER=postgres
DB_PASSWORD=your_password_here
DB_HOST=localhost
DB_PORT=5432
DATABASE_URL=postgresql://postgres:your_password_here@localhost:5432/dhanx

SECRET_KEY=change_me_in_production
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=1440

ALLOWED_HOSTS=localhost,127.0.0.1
TIME_ZONE=Asia/Kolkata

MAIL_USERNAME=you@example.com
MAIL_PASSWORD=your_mail_password
MAIL_FROM=you@example.com
MAIL_PORT=587
MAIL_SERVER=smtp.gmail.com
MAIL_TLS=true
MAIL_SSL=false

FRONTEND_URL=http://localhost:3000
LOG_LEVEL=DEBUG
```

Create a `.env` file in the `frontend` folder, for example:

```env
REACT_APP_API_URL=http://localhost:8000
```

> Change the example values (DB name, passwords, email, hosts, ports, etc.) as per your own setup before running in development or production.

### 5. Running the apps

- Run the **frontend** (`npm start` in the `frontend` folder) and the **backend** (`python main.py` in the `backend` folder) **in two separate terminals**.

You can now run the **frontend** and **backend** together for local development.


