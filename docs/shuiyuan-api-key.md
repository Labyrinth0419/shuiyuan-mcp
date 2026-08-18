由于不想在[水源社区存档工具](https://shuiyuan.sjtu.edu.cn/t/topic/43559)楼下面继续偏离话题，所以单独开一个主题帖记录。这里提供一份使用 Python 实现的申请水源（Discourse）的 User API Key 的简单示例代码，方便有需要的开发者参考：

```python
import base64
import json
import secrets
import urllib.parse
import uuid
import webbrowser
from collections.abc import Iterable
from dataclasses import dataclass

import requests
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import padding, rsa

SITE_URL_BASE = 'https://shuiyuan.sjtu.edu.cn'
ALL_SCOPES = [
    'read',
    'write',
    'message_bus',
    'push',
    'one_time_password',
    'notifications',
    'session_info',
    'bookmarks_calendar',
    'user_status',
]
DEFAULT_SCOPES = ['read']


@dataclass
class UserApiKeyPayload:
    key: str
    nonce: str
    push: bool
    api: int


@dataclass
class UserApiKeyRequestResult:
    client_id: str
    payload: UserApiKeyPayload


def generate_user_api_key(
    application_name: str, *,
    client_id: str | None = None,
    scopes: Iterable[str] | None = None,
) -> UserApiKeyRequestResult:
    # Generate RSA key pair.
    private_key = rsa.generate_private_key(
        public_exponent=65537,
        key_size=4096,
    )
    public_key = private_key.public_key()
    public_key_pem = public_key.public_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PublicFormat.SubjectPublicKeyInfo,
    ).decode('ascii')

    # Generate a random client ID if not provided.
    client_id_to_use = str(uuid.uuid4()) if client_id is None else client_id
    nonce = secrets.token_urlsafe(32)

    # Validate scopes.
    scopes_list = DEFAULT_SCOPES if scopes is None else list(scopes)
    if not set(scopes_list) <= set(ALL_SCOPES):
        raise ValueError('Invalid scopes')

    # Build request URL and open in browser.
    params_dict: dict[str, str] = {
        'application_name': application_name,
        'client_id': client_id_to_use,
        'scopes': ','.join(scopes_list),
        'public_key': public_key_pem,
        'nonce': nonce,
    }
    params_str = '&'.join(f'{k}={urllib.parse.quote(v)}' for k, v in params_dict.items())
    webbrowser.open(f'{SITE_URL_BASE}/user-api-key/new?{params_str}')

    # Receive, decrypt and check response payload from server.
    enc_payload = input('Paste the response payload here: ')
    dec_payload = UserApiKeyPayload(**json.loads(private_key.decrypt(
        base64.b64decode(enc_payload),
        padding.PKCS1v15(),
    )))
    if dec_payload.nonce != nonce:
        raise ValueError('Nonce mismatch')

    # Return client ID and response payload.
    return UserApiKeyRequestResult(
        client_id=client_id_to_use,
        payload=dec_payload,
    )


def test_user_api_key(key: str) -> None:
    # Perform a search query against the Discourse site.
    r = requests.get(
        f'{SITE_URL_BASE}/search.json',
        params={'q': 'tags:水源开发者'},
        headers={'User-Api-Key': key},
        timeout=5,
    )
    # Expect some results.
    print(r.json())


def main() -> None:
    # Generate a user API key and test it.
    result = generate_user_api_key('Shuiyuan Sample App')
    print(result)  # Store this somewhere
    test_user_api_key(result.payload.key)


if __name__ == '__main__':
    main()
```

（这里面不少细节都得读 [Discourse 源码](https://github.com/discourse/discourse/blob/main/app/controllers/user_api_keys_controller.rb)才清楚，[文档](https://meta.discourse.org/t/user-api-keys-specification/48536)不够详细）

使用方式：

- 代码会使用浏览器打开授权页面，用户授权后，粘贴所返回的 payload 到应用程序中，即可完成授权。
- 此后可以访问所有有权限访问的 Discourse API，包括[文档中描述的](https://docs.discourse.org/)和没有描述的，只需用 HTTP 请求头 `User-Api-Key` 传递 key 即可。

注意：

- 这里的示例代码生成了随机的 `client_id`。`client_id` 是一个应用的唯一标识符，在为同一应用申请新的 key 时应该使用与原来相同的 `client_id`，这样可以自动销毁旧的 key。
- 根据应用需求，合理选择授予 key 的权限（scope）。样例代码中 `ALL_SCOPES` 是所有 scope 的列表，来源于：https://github.com/discourse/discourse/blob/main/app/models/user_api_key_scope.rb
- 用户可以随时在[“偏好设置” -> “安全性”页面](https://shuiyuan.sjtu.edu.cn/my/preferences/security)撤销任意的 User API Key。