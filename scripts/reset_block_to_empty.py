"""
Reset block F001-004 to EMPTY state for testing
"""
import requests

# Login
login_response = requests.post(
    "http://localhost/api/v1/auth/login",
    json={"email": "admin@a64platform.com", "password": "SuperAdmin123!"}
)
token = login_response.json()["access_token"]
headers = {"Authorization": f"Bearer {token}"}

farm_id = "0bef9a0e-172c-4b5d-96a0-5fd98c268967"
block_id = "ea89f238-dfe5-4be2-99e6-113b02a7d486"

# Transition through states to get to EMPTY
transitions = [
    ("HARVESTING", "harvesting"),
    ("CLEANING", "cleaning"),
    ("EMPTY", "empty")
]

for step_name, new_status in transitions:
    print(f"Transitioning to {step_name}...")
    response = requests.patch(
        f"http://localhost/api/v1/farm/farms/{farm_id}/blocks/{block_id}/status",
        headers=headers,
        json={"newStatus": new_status}
    )
    if response.status_code == 200:
        print(f"  Success! Block is now {new_status}")
    else:
        print(f"  Failed: {response.status_code} - {response.text}")
        break

print("\nBlock reset complete!")
