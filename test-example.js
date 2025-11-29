// Test JavaScript file for demonstrating syntax highlighting
function greet(name) {
    console.log(`Hello, ${name}!`);
    return true;
}

const numbers = [1, 2, 3, 4, 5];
const doubled = numbers.map(n => n * 2);

class Person {
    constructor(name, age) {
        this.name = name;
        this.age = age;
    }

    sayHello() {
        console.log(`Hi, I'm ${this.name}`);
    }
}

// This is a comment
const person = new Person('Alice', 30);
person.sayHello();
