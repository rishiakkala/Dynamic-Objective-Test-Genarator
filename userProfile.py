import os
import json
from pathlib import Path
from datetime import datetime

# Store user profiles in data/users/ relative to this file
_USERS_DIR = Path(__file__).parent / "data" / "users"
_USERS_DIR.mkdir(parents=True, exist_ok=True)


class UserProfile:
    """Track user performance and capabilities"""
    
    def __init__(self, user_id: str):
        self.user_id = user_id
        self.performance_history = []
        self.skill_level = 1500  # Elo-like rating, starting at intermediate
        self.topics_mastery = {}
        self.response_times = []
        self.accuracy_rate = 0.0
        self.current_difficulty = "medium"
        self.confidence_scores = []
        
    def add_response(self, question_id, correct, time_taken, difficulty, topic, confidence=None):
        """Record a user response"""
        self.performance_history.append({
            "timestamp": datetime.now().isoformat(),
            "question_id": question_id,
            "correct": correct,
            "time_taken": time_taken,
            "difficulty": difficulty,
            "topic": topic,
            "confidence": confidence
        })
        
        self.response_times.append(time_taken)
        
        # Update topic mastery
        if topic not in self.topics_mastery:
            self.topics_mastery[topic] = {"correct": 0, "total": 0}
        
        self.topics_mastery[topic]["total"] += 1
        if correct:
            self.topics_mastery[topic]["correct"] += 1
        
        # Update overall accuracy
        total = len(self.performance_history)
        correct_count = sum(1 for r in self.performance_history if r["correct"])
        self.accuracy_rate = correct_count / total if total > 0 else 0.0
        
        if confidence:
            self.confidence_scores.append(confidence)
        
        # Update skill level based on performance
        self._update_skill_level(correct, difficulty, time_taken, confidence)
    
    def get_stats(self):
        """Get user statistics"""
        return {
            "user_id": self.user_id,
            "skill_level": self.skill_level,
            "accuracy_rate": self.accuracy_rate,
            "avg_response_time": sum(self.response_times) / len(self.response_times) if self.response_times else 0,
            "topics_mastery": self.topics_mastery,
            "current_difficulty": self.current_difficulty,
            "total_questions": len(self.performance_history)
        }
    
    def save(self):
        """Save profile to data/users/ directory."""
        path = _USERS_DIR / f"user_profile_{self.user_id}.json"
        with open(path, "w", encoding="utf-8") as f:
            json.dump(self.__dict__, f, indent=2)

    def _update_skill_level(self, correct, difficulty, time_taken, confidence):
        """Update skill level using Elo-like rating system"""
        # Difficulty multipliers
        difficulty_multipliers = {"easy": 0.8, "medium": 1.0, "hard": 1.2}
        multiplier = difficulty_multipliers.get(difficulty, 1.0)
        
        # Base change amount
        base_change = 30 * multiplier
        
        # Time factor (faster = better)
        avg_time = sum(self.response_times) / len(self.response_times) if self.response_times else 30
        time_factor = max(0.5, min(1.5, avg_time / time_taken)) if time_taken > 0 else 1.0
        
        # Confidence factor
        confidence_factor = (confidence / 5.0) if confidence else 1.0
        
        # Calculate skill change
        if correct:
            skill_change = base_change * time_factor * confidence_factor
        else:
            skill_change = -base_change * confidence_factor
        
        # Apply change with bounds
        self.skill_level = max(800, min(2200, self.skill_level + skill_change))
    
    @classmethod
    def load(cls, user_id: str):
        """Load profile from data/users/; fall back to root for legacy files."""
        # New location
        new_path = _USERS_DIR / f"user_profile_{user_id}.json"
        # Legacy location (root) — migrate automatically on first load
        legacy_path = Path(__file__).parent / f"user_profile_{user_id}.json"

        path = new_path if new_path.exists() else (legacy_path if legacy_path.exists() else None)
        if path:
            try:
                with open(path, "r", encoding="utf-8") as f:
                    data = json.load(f)
                profile = cls(user_id)
                profile.__dict__.update(data)
                # Migrate legacy file to new location automatically
                if path == legacy_path:
                    profile.save()
                return profile
            except Exception:
                pass
        return cls(user_id)
