import pyotp
import sys
secret = sys.argv[1] if len(sys.argv) > 1 else "Z3VESIYN2EDPAM6N3MXVBXAVIZUAOKG2"
totp = pyotp.TOTP(secret)
code = totp.now()
sys.stdout.write(code)
