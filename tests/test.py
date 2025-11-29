def hello_world():
    print("Hello from Python!")

class Test:
    def __init__(self):
        self.value = 42

if __name__ == "__main__":
    t = Test()
    print(f"Value: {t.value}")