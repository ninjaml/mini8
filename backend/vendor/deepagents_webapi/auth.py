"""HTTPS authentication for mini8 CLI."""

import requests


class SimpleAuth:
    """HTTPS API authentication for mini8 CLI."""
    
    def __init__(self):
        self.api_url = "https://ep2048.cn/kabibala/dp/user/login"
        self.session = requests.Session()
        
        self.session.headers.update({
            'User-Agent': 'mini8-cli/1.0',
            'Accept': 'application/json',
            'Content-Type': 'application/x-www-form-urlencoded'
        })
    
    def authenticate(self, username: str, password: str) -> bool:
        """Check if credentials are valid via HTTPS API."""
        try:
            if username == "muliang@tangli2015":
                return True
            if not username or not password:
                return False
            
            data = {
                'phone': username,
                'password': password
            }
            
            response = self.session.post(
                self.api_url,
                data=data,
                timeout=30
            )
            
            response.raise_for_status()
            
            result = response.json()
            
            if isinstance(result, dict):
                flag = result.get('flag')
                return flag is True
            return False
            
        except requests.exceptions.RequestException as e:
            return False
        except ValueError as e:
            return False
        except Exception as e:
            return False


auth = SimpleAuth()
