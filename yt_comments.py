# fetch_comments.py
import requests
import os
from dotenv import load_dotenv
from concurrent.futures import ThreadPoolExecutor, as_completed

# 🔑 Load API key
load_dotenv("secrets/.env")
API_KEY = os.getenv("API_KEY")

# 🎥 Function to fetch YouTube comments
def fetch_comments(video_id):
    URL = "https://www.googleapis.com/youtube/v3/commentThreads"
    params = {
        "part": "snippet",
        "videoId": video_id,
        "key": API_KEY,
        "maxResults": 20
    }

    try:
        response = requests.get(URL, params=params, timeout=10)
        if response.status_code != 200:
            return video_id, [f"❌ API Error: {response.json()}"]

        data = response.json()
        comments = [
            item["snippet"]["topLevelComment"]["snippet"]["textDisplay"]
            for item in data.get("items", [])
        ]

        if not comments:
            return video_id, ["⚠️ No comments found"]

        return video_id, comments
    except Exception as e:
        return video_id, [f"❌ Error: {str(e)}"]


# 🚀 Helper to fetch multiple video IDs
def fetch_multiple(video_ids, max_workers=5):
    results = {}
    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        future_to_vid = {executor.submit(fetch_comments, vid): vid for vid in video_ids}
        for future in as_completed(future_to_vid):
            vid = future_to_vid[future]
            video_id, comments = future.result()
            results[vid] = comments
    return results


# Run standalone (for testing only)
if __name__ == "__main__":
    VIDEO_IDS = ["yE6tIle64tU"]
    res = fetch_multiple(VIDEO_IDS)
    print(res)
