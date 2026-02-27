import axios from "axios";

const API = axios.create({ baseURL: "http://localhost:8000" });

export const uploadDocument = (file: File) => {
    const form = new FormData();
    form.append("file", file);
    return API.post<{ session_id: string; filename: string }>("/upload", form);
};

export const getSessionStatus = (sessionId: string) =>
    API.get<{ status: string; progress: Record<string, unknown>; error?: string }>(`/session/${sessionId}/status`);

export const generateQuestions = (payload: {
    session_id: string; difficulty: string; count: number; topic_hint?: string;
}) => API.post<{ questions: Array<{ id: number; block: string; correct_answer: string; reasoning: string }> }>("/generate", payload);

export const generateByTopic = (payload: {
    topic: string; difficulty: string; count: number;
}) => API.post<{ session_id: string; questions_file: string; questions: Array<{ id: number; block: string; correct_answer: string; reasoning: string }> }>("/generate-topic", payload);

export const evaluateSession = (sessionId: string) =>
    API.get<{ num_questions: number; metrics: Record<string, unknown>; questions: unknown[] }>(`/session/${sessionId}/evaluate`);

export const getVectorStats = () =>
    API.get<{ total_chunks: number; collection: string }>("/vectordb/stats");

export const getUser = (userId: string) =>
    API.get<{ total_questions: number; accuracy_rate: number; avg_response_time: number; skill_level: number; current_difficulty: string; topics_mastery: Record<string, { correct: number; total: number }> }>(`/user/${userId}`);

export const submitAnswer = (payload: {
    user_id: string; question_id: string; user_answer: string; correct_answer: string;
    time_taken: number; difficulty: string; topic: string; confidence: number;
}) => API.post("/user/answer", payload);

export const getUserSessionPerformance = (userId: string, sessionId?: string) =>
    API.get<{ 
        user_id: string;
        total_questions: number;
        correct_answers: number;
        accuracy_rate: number;
        avg_response_time: number;
        current_difficulty: string;
        skill_level: number;
        topics_mastery: Record<string, { correct: number; total: number }>;
        session_history: Array<{
            question_id: string;
            correct: boolean;
            time_taken: number;
            difficulty: string;
            topic: string;
            timestamp: string;
        }>;
    }>(`/user/${userId}/performance`, { params: { session_id: sessionId } });

export default API;
