dry-principles-in-typescript
DRY Principles in TypeScript:

Understanding DRY:

DRY stands for "Don't Repeat Yourself". It's a principle aimed at reducing the repetition of software patterns. In TypeScript, it means creating a codebase where each piece of knowledge or logic is only represented once.

Functions for Reusable Logic:

Use functions to encapsulate reusable logic. If you find yourself writing the same code multiple times, it's often a sign that you should extract it into a function.

Generic Types for Flexibility:

Utilize generic types to create flexible and reusable components or functions that can work with any type, avoiding duplication for each type you work with.

Interfaces for Object Shapes:

Define interfaces to represent the shape of objects. This way, you avoid repeating the same type annotations and can easily change the shape of related objects by changing just the interface.

Utility Types to Manipulate Types:

TypeScript comes with built-in utility types such as Partial, Readonly, and Record that help you manipulate types in a DRY way, without having to redefine new types from scratch.

Extending Interfaces and Classes:

Extend existing interfaces and classes to create new specifications. This keeps your code DRY by allowing you to build on what is already defined.

Module Imports to Share Code:

Use modules to share and reuse code across different parts of your application. Importing modules can help keep your codebase DRY by having a single source of truth.

Type Aliases for Complex Types:

Create type aliases for complex or commonly used types. Instead of repeating complex type annotations, you can define them once and then use the alias.

Enums for Fixed Value Sets:

Use enums to encapsulate a set of fixed values. This avoids repeating the same set of literal values and makes it easier to update them if needed.

Type Aliases for Complex Types:

Create type aliases for complex or commonly used types. Instead of repeating complex type annotations, you can define them once and then use the alias.

// Bad: Repeated complex type
function processUser(user: { name: string; age: number; email: string }) {
  // ...
}

// Good: Type alias
type User = { name: string; age: number; email: string };
function processUser(user: User) {
  // ...
}

Enums for Fixed Value Sets:
Use enums to encapsulate a set of fixed values. This avoids repeating the same set of literal values and makes it easier to update them if needed.

// Bad: Repeated literals
const STATUS_ACTIVE = 'active';
const STATUS_INACTIVE = 'inactive';
const STATUS_PENDING = 'pending';

// Good: Enum
enum Status {
  Active = 'active',
  Inactive = 'inactive',
  Pending = 'pending'
}

Function Overloading for Variation:
Instead of writing multiple functions that do similar things, use function overloading to handle different types or numbers of arguments.

// Bad: Multiple functions for each variation
function greet(name: string) {
  console.log(`Hello, ${name}!`);
}
function greetWithAge(name: string, age: number) {
  console.log(`Hello, ${name}! You are ${age} years old.`);
}

// Good: Function overloading
function greet(name: string, age?: number) {
  if (age !== undefined) {
    console.log(`Hello, ${name}! You are ${age} years old.`);
  } else {
    console.log(`Hello, ${name}!`);
  }
}

Mapped Types for Creating Variants:
Use mapped types to create new types by transforming properties of existing ones. This helps in keeping your type definitions DRY.

// Bad: Manually creating a variant
interface ReadOnlyUser {
  readonly name: string;
  readonly age: number;
}

// Good: Mapped type
type ReadOnly<T> = { readonly [P in keyof T]: T[P] };
type ReadOnlyUser = ReadOnly<User>;

Decorator Functions for Meta-programming:
Decorators allow you to annotate and modify classes and properties at design time. They can be used to add common behavior to various parts of your application in a DRY manner.

// A simple log decorator
function log(target: any, propertyKey: string, descriptor: PropertyDescriptor) {
  const originalMethod = descriptor.value;
  descriptor.value = function (...args: any[]) {
    console.log(`Arguments: ${args}`);
    return originalMethod.apply(this, args);
  }
}

class MathOperations {
  @log
  add(x: number, y: number) {
    return x + y;
  }
}

Using Mixins for Composition:
Mixins are a way of composing classes from multiple sources. Create classes that can be combined to add common functionality instead of repeating the same methods across classes.

// Mixin function
function applyMixins(derivedCtor: any, baseCtors: any[]) {
  baseCtors.forEach(baseCtor => {
    Object.getOwnPropertyNames(baseCtor.prototype).forEach(name => {
      derivedCtor.prototype[name] = baseCtor.prototype[name];
    });
  });
}

class Disposable {
  dispose() {
    console.log('Disposing resource');
  }
}

class Activatable {
  activate() {
    console.log('Activating');
  }
}

// Combined class with mixins
class SmartObject implements Disposable, Activatable {
  // Mixin properties will go here
  dispose: () => void;
  activate: () => void;
}

applyMixins(SmartObject, [Disposable, Activatable]);

Conditional Types for Type Logic:
Leverage conditional types to avoid repeating type definitions. They allow you to branch type logic based on conditions, creating more dynamic and reusable type definitions.

// Conditional type that returns a string or number type based on the input type
type StringOrNumber<T> = T extends boolean ? string : number;

// Usage
let a: StringOrNumber<true>;  // Type is string
let b: StringOrNumber<false>; // Type is number

DRY in Testing with Utility Functions:
When writing tests in TypeScript, create utility functions for common setup and teardown steps. This approach keeps your tests DRY, easier to read, and maintain.

// Bad: Repetitive setup in tests
it('test 1', () => {
  const user = new User('John', 'Doe');
  // test logic
});
it('test 2', () => {
  const user = new User('John', 'Doe');


  // test logic
});

// Good: Utility function for creating test users
function createTestUser() {
  return new User('John', 'Doe');
}

it('test 1', () => {
  const user = createTestUser();
  // test logic
});
it('test 2', () => {
  const user = createTestUser();
  // test logic
});

By using these strategies, you can ensure that your TypeScript code follows the DRY principle, which can significantly improve code quality and reduce the likelihood of bugs.

## 2. Applying DRY and WET

Advanced Guide on DRY and WET Principles in TypeScript
Kyiv Tech
Kyiv Tech

Follow
11 min read
·
Nov 25, 2023
52




Press enter or click to view image in full size
Advanced Guide on DRY and WET Principles in TypeScript
Designed with Canva and Unsplash
In the fast-paced realm of software development, embracing principles like DRY (Don’t Repeat Yourself) and WET (Write Everything Twice) is key to crafting efficient and maintainable code. TypeScript, with its robust type system, offers a unique platform to implement these principles effectively. This comprehensive guide delves into the nuances of DRY and WET in TypeScript, elucidating their impact with practical examples. Let’s embark on this journey to transform your TypeScript coding practices!

Understanding DRY: The Cornerstone of Code Reusability
At the heart of efficient coding lies the DRY principle, which advocates for minimizing code repetition. It encourages developers to centralize and reuse code logic, making a codebase more maintainable and less error-prone. This principle becomes even more potent in TypeScript due to its ability to enforce type safety and predictability across a project.

Why Embrace DRY in TypeScript?
Maintainability: Centralizing logic means changes need to be made in only one place, ensuring consistency across your codebase.

Readability: A codebase with less repetition is inherently easier to read and understand, crucial for team collaboration.

Efficiency: Embracing DRY can lead to fewer bugs and easier refactoring, saving valuable development time.

Exploring WET: When Redundancy is Not the Enemy
WET, standing for Write Everything Twice, challenges the notion that all code duplication is bad. This principle accepts that in some contexts, repetition can be beneficial for the clarity and simplicity of your code.

The Justification for WET in TypeScript
Simplicity: Direct and straightforward code, even if repetitive, can be more comprehensible, especially for new developers.

Decoupling: Repetition can sometimes prevent complex dependencies, making parts of the codebase more independent and robust.

Avoiding Unnecessary Duplication in TypeScript
In TypeScript, applying the DRY principle typically involves strategies like:

Creating Helper Functions: To avoid repeating similar checks or operations.
Example: Refactoring direct user.isAdmin checks into a reusable isAdmin(user) function.
Abstracting Constants: To prevent hardcoding repeated values.
Example: Using const ENTITY_NAME = "product" instead of repeatedly hardcoding the string "product".
Implementing Inheritance and Generics: To reduce code duplication across entities with similar operations.
Example: Creating a generic CRUDService<T> class for shared CRUD operations across different services.
Conversely, the WET principle may be applied in scenarios like:

Maintaining Code Clarity: Sometimes, repetition can enhance readability and maintain the self-contained nature of code blocks.
Example: In cases where abstracting logic into a separate function or file would obscure the understanding of the code, it’s better to keep the repetition. This is particularly true for code that is simple and unlikely to change.
Facilitating Independent Evolution: When different parts of the code are likely to evolve separately, keeping them independent, even at the cost of some repetition, can be beneficial.
Example: If two functions start out similarly but are expected to diverge in their logic or requirements over time, it’s wise to keep them separate to accommodate future changes more easily.
Consider Mentioned Scenarios
1. Using Helper Functions
Problem: Repeating similar checks or operations across multiple parts of your code.

Solution: Create reusable functions.

Example:

Before: Directly checking if (user.isAdmin) in multiple functions.

Initially, the check if (user.isAdmin) is used directly in multiple functions, leading to repetitive code that can be difficult to manage and update.

Code with Direct Validations

interface User {
    id: number;
    username: string;
    isAdmin: boolean;
}

class UserService {
    deleteUser(user: User): void {
        if (user.isAdmin) {
            // Logic to prevent deletion
            console.log('Admin user cannot be deleted');
        } else {
            // Delete user logic
            console.log('User deleted');
        }
    }
    updateUser(user: User): void {
        if (user.isAdmin) {
            // Special logic for admin
            console.log('Updating admin user');
        } else {
            // General update logic
            console.log('Updating regular user');
        }
    }
    // Other methods that use if (user.isAdmin) check
}
In this code, the if (user.isAdmin) check is duplicated in deleteUser and updateUser methods, along with potentially other places in the UserService class.

After: Create a function isAdmin(user) and use it wherever the check is needed.

To improve maintainability and reduce duplication, we can create a helper function isAdmin and use it wherever the check is needed.

Refactoring with a Helper Function

function isAdmin(user: User): boolean {
    return user.isAdmin;
}

class UserService {
    deleteUser(user: User): void {
        if (isAdmin(user)) {
            // Logic to prevent deletion
            console.log('Admin user cannot be deleted');
        } else {
            // Delete user logic
            console.log('User deleted');
        }
    }
    updateUser(user: User): void {
        if (isAdmin(user)) {
            // Special logic for admin
            console.log('Updating admin user');
        } else {
            // General update logic
            console.log('Updating regular user');
        }
    }
    // Other methods now use isAdmin(user) check
}
In the refactored code, the check is abstracted into the isAdmin function. This makes the code cleaner and easier to manage. If the logic for determining whether a user is an admin changes in the future, we only need to update the isAdmin function, rather than searching for and updating every instance of the check throughout the codebase. This is a clear example of how helper functions can simplify code maintenance and enhance readability.

2. Declaring Variables for Repeated Values
Problem: Repeating strings or values multiple times in your code, like hardcoding “product” in several places.

Solution: Abstract these repeated strings or values into constants.

Example:

Before: Using "product" string directly in multiple functions.

In this scenario, the string “product” is used directly in multiple functions, leading to potential issues with maintainability and consistency.

ProductService with Hardcoded String

class ProductService {
    getProductDescription(id: number): string {
        return `Product ID: ${id}, Description of product`;
    }
    getProductCategory(id: number): string {
        return `Product ID: ${id}, Category of product`;
    }
    // Other methods that use the string "product"
}
In this code, the string "product" is hardcoded in multiple methods. If the entity name needs to be changed, it requires updates in multiple places, increasing the chance of errors and making maintenance more challenging.

After: Declare const ENTITY_NAME = "product" and use ENTITY_NAME across your code.

To improve maintainability, we can abstract the repeated string “product” into a constant and use this constant across the codebase.

Refactoring with a Constant

const ENTITY_NAME = "product";

class ProductService {
    getProductDescription(id: number): string {
        return `Product ID: ${id}, Description of ${ENTITY_NAME}`;
    }
    getProductCategory(id: number): string {
        return `Product ID: ${id}, Category of ${ENTITY_NAME}`;
    }
    // Other methods using ENTITY_NAME
}
In the refactored code, the string "product" is replaced by the constant ENTITY_NAME. This makes the code more maintainable because if the entity name changes in the future, it only needs to be updated in one place, reducing the risk of errors and inconsistencies. This approach also enhances readability, as it becomes clear that ENTITY_NAME is a significant and consistent value used throughout the ProductService class.

3. Using Options Objects Instead of Many Function Arguments
Problem: Functions with a long list of parameters can be confusing and error-prone.

Solution: Use an options object to make function calls more readable and manageable.

Example:

Before: createVehicle('car', 'blue', 4, 'gas', 100)

In this scenario, the function createVehicle is designed with multiple parameters, which can make the code difficult to read and maintain.

Function Definition with Multiple Parameters

function createVehicle(type: string, color: string, wheels: number, fuel: string, power: number): string {
    return `Created a ${type}, color: ${color}, with ${wheels} wheels, fuel type: ${fuel}, power: ${power}hp.`;
}

// Usage
const vehicle1 = createVehicle('car', 'blue', 4, 'gas', 100);
console.log(vehicle1);
In this function, each attribute of a vehicle is a separate parameter. This approach can become problematic, especially when dealing with functions that have a large number of parameters, as it’s easy to mix up the order or forget the purpose of each parameter.

After: createVehicle({ type: 'car', color: 'blue', wheels: 4, fuel: 'gas', power: 100 })

To improve readability and reduce the potential for errors, we can refactor the function to accept an options object.

Get Kyiv Tech’s stories in your inbox
Join Medium for free to get updates from this writer.

Enter your email
Subscribe

Remember me for faster sign in

Function Definition with an Options Object

interface VehicleOptions {
    type: string;
    color: string;
    wheels: number;
    fuel: string;
    power: number;
}

function createVehicle(options: VehicleOptions): string {
    return `Created a ${options.type}, color: ${options.color}, with ${options.wheels} wheels, fuel type: ${options.fuel}, power: ${options.power}hp.`;
}

// Usage
const vehicle2 = createVehicle({ type: 'car', color: 'blue', wheels: 4, fuel: 'gas', power: 100 });
console.log(vehicle2);
With this refactoring, the function now takes a single options object that encapsulates all the vehicle attributes. This makes the function call much more readable and manageable. It's clearer what each value represents, and there's less risk of mixing up the order of the parameters. This approach is particularly beneficial for functions with a large number of parameters or when the parameters are optional.

4. Utilizing Inheritance and Generics
Problem: Similar operations across different entities leading to code duplication.

Solution: Use inheritance and generics to create a common base that can be extended as needed.

Example:

Before: ProductService and FeedbackService with similar CRUD operations.

Separate Services with Similar CRUD Operations

Initially, ProductService and FeedbackService are implemented separately, but they perform similar CRUD (Create, Read, Update, Delete) operations, leading to duplicated code.

ProductService with CRUD Operations

interface Product {
    id: number;
    name: string;
    // Other product properties
}

class ProductService {
    createProduct(product: Product): void {
        // Implementation for creating a product
    }
    readProduct(id: number): Product {
        // Implementation for reading a product
        return { id, name: "Sample Product" };
    }
    // Similar implementations for updateProduct and deleteProduct
}
FeedbackService with CRUD Operations

interface Feedback {
    id: number;
    content: string;
    // Other feedback properties
}

class FeedbackService {
    createFeedback(feedback: Feedback): void {
        // Implementation for creating feedback
    }
    readFeedback(id: number): Feedback {
        // Implementation for reading feedback
        return { id, content: "Sample Feedback" };
    }
    // Similar implementations for updateFeedback and deleteFeedback
}
In the above code, both ProductService and FeedbackService have their own implementations of CRUD operations, which leads to code duplication.

After: Create a generic CRUDService<T> and extend it to create specific services like ProductService extends CRUDService<Product>.

Using Inheritance and Generics

We can refactor the services to use a generic CRUDService<T> class. This base class implements the CRUD operations once, and then specific services like ProductService and FeedbackService can extend it, specifying the type they work with.

Generic CRUDService<T>

interface Identifiable {
    id: number;
}

class CRUDService<T extends Identifiable> {
    create(entity: T): void {
        // Generic implementation for creating an entity
    }
    read(id: number): T {
        // Generic implementation for reading an entity
        return { id } as T;
    }
    // Generic implementations for update and delete
}
Extending CRUDService for Specific Entities

class ProductService extends CRUDService<Product> {
    // Specific logic for ProductService can go here
}

class FeedbackService extends CRUDService<Feedback> {
    // Specific logic for FeedbackService can go here
}
In the refactored code, the CRUDService<T> class provides a generic implementation of CRUD operations, applicable to any entity type T that extends the Identifiable interface. ProductService and FeedbackService then extend CRUDService, specifying Product and Feedback as their respective types. This approach eliminates code duplication by centralizing the CRUD logic in one place, while still allowing for entity-specific logic in the extending classes.

5. Using Shared Modules
Problem: Duplicating logic (like validation functions) in client and server sides.

Solution: Use shared libraries or modules in both client and server applications.

Example:

Before: Implementing passwordIsValid() function separately in both client and server codebases.

Client-Side (TypeScript in a Web Application)

// Client-side code in a web application

function passwordIsValid(password: string): boolean {
    return password.length >= 6;
}

// Usage in the client
const clientPassword = "clientExample";
console.log("Is client password valid?", passwordIsValid(clientPassword));
Server-Side (TypeScript in a Node.js Server)

// Server-side code in a Node.js application

function passwordIsValid(password: string): boolean {
    return password.length >= 6;
}

// Usage in the server
const serverPassword = "serverExample";
console.log("Is server password valid?", passwordIsValid(serverPassword));
In the above example, the passwordIsValid function is duplicated in both the client-side and server-side codebases. This leads to potential issues with maintainability and consistency.

After: Create a shared module with passwordIsValid() and import it in both client and server.

Shared Module (TypeScript)

// Shared module: validation.ts
export function passwordIsValid(password: string): boolean {
    return password.length >= 6;
}
Client-Side Using Shared Module

// Client-side code using the shared module
import { passwordIsValid } from './validation';

const clientPassword = "clientExample";
console.log("Is client password valid?", passwordIsValid(clientPassword));
Server-Side Using Shared Module

// Server-side code using the shared module
import { passwordIsValid } from './validation';
const serverPassword = "serverExample";
console.log("Is server password valid?", passwordIsValid(serverPassword));
In the refactored example, the passwordIsValid function is defined once in a shared module (validation.ts) and then imported and used both in the client-side and server-side applications. This approach ensures that the validation logic is consistent across both platforms and adheres to the DRY principle. Additionally, it simplifies maintenance, as any changes to the validation logic only need to be made in one place.

Incidental Duplication
Insight: Distinguishes between syntax duplication (mere repetition of code) and knowledge duplication (repetition of business logic or domain knowledge).

Key Point: Not all code duplication violates the DRY principle. It’s essential to evaluate whether the duplication is about syntactical convenience or an actual repetition of knowledge.

Examples:

Syntax Duplication: Using a for loop in multiple functions isn't necessarily a DRY violation.

In this example, using a for loop in multiple functions is not a violation of the DRY principle. This is because the for loop is a common syntax used for iteration and does not represent a specific business logic.

// Function to calculate the sum of an array
function calculateSum(numbers: number[]): number {
    let sum = 0;
    for (let i = 0; i < numbers.length; i++) {
        sum += numbers[i];
    }
    return sum;
}

// Function to find the maximum number in an array
function findMax(numbers: number[]): number {
    let max = numbers[0];
    for (let i = 0; i < numbers.length; i++) {
        if (numbers[i] > max) {
            max = numbers[i];
        }
    }
    return max;
}
In both calculateSum and findMax, the for loop is used for iterating over an array, but they serve different purposes (summing up numbers vs. finding the maximum number). This is a case of syntax duplication, which is acceptable.

Knowledge Duplication: Replicating a complex business rule in several places is a violation of DRY.

In this example, replicating a complex business rule, such as a specific validation logic, in several places is a violation of the DRY principle.

// Initial code with knowledge duplication

// Function to validate a user for a special discount
function validateUserForDiscount(user: User): boolean {
    return user.age > 18 && user.hasLoyaltyCard && user.purchaseHistory.length > 5;
}

// Function to validate a user for a premium service
function validateUserForPremium(user: User): boolean {
    return user.age > 18 && user.hasLoyaltyCard && user.purchaseHistory.length > 5;
}
Here, the same validation logic (checking age, loyalty card status, and purchase history) is duplicated in both validateUserForDiscount and validateUserForPremium. This is a clear case of knowledge duplication.

Refactored Code to Avoid Knowledge Duplication

// Refactored code

// Centralized validation logic
function isEligibleForSpecialServices(user: User): boolean {
    return user.age > 18 && user.hasLoyaltyCard && user.purchaseHistory.length > 5;
}

// Function to validate a user for a special discount
function validateUserForDiscount(user: User): boolean {
    return isEligibleForSpecialServices(user);
}

// Function to validate a user for a premium service
function validateUserForPremium(user: User): boolean {
    return isEligibleForSpecialServices(user);
}
In the refactored code, the validation logic is centralized in a single function isEligibleForSpecialServices, which is then used in both validateUserForDiscount and validateUserForPremium. This approach adheres to the DRY principle by eliminating the duplication of business logic.

Conclusion: Harmonizing Principles for Optimal Coding 🌟
Mastering TypeScript involves not just understanding its syntax and features but also knowing how to apply design principles effectively. By judiciously applying DRY and WET principles, developers can create TypeScript code that is not only efficient and maintainable but also clear and adaptable. The key is to balance the need for abstraction and reusability with the need for simplicity and clarity, thereby building a robust and scalable codebase.



## 3. Architecture and Change Design for Wilderfolk

The goal of architecture is to make creative changes easier to understand, build, test, and reverse when necessary. It is not to introduce layers, services, queues, or abstractions for their own sake. Before a non-trivial feature or refactor becomes permanent, identify the intended player outcome, the state it affects, the components it crosses, and the smallest structure that can meet that need. This follows the design-context approach described by SystemsArchitect.io.[1]

### Start from context, then choose a shape

Use this short decision check for a new subsystem, cross-cutting feature, or major refactor. It is an aid to clear implementation, not a pre-approval gate for creativity.

| Question | Wilderfolk application |
|---|---|
| What is the player-facing outcome? | State the experience or gameplay behavior first, not only the desired code structure. |
| Which existing owner, cadence, and state are affected? | Follow `AGENTS.md`: one authoritative owner for each simulation decision, one declared cadence, and no second mutation path. |
| Which boundary is crossed? | Identify presentation, typed command, simulation/worker, rendering, and save/load effects before the implementation becomes permanent. |
| What is the simplest viable module shape? | Prefer a focused in-process TypeScript module or React hook/component when it meets the need. |
| What would prove the choice wrong? | Name a targeted test, deterministic scenario, performance measurement, visual check, or save round trip. |
| What must remain easy to change? | Keep experimental mechanics, UI concepts, and feature-local rules reversible until the domain concept has stabilised. |

### Prefer proportional architecture

SystemsArchitect.io describes how higher-complexity patterns can add decoupling, scale, and reliability while also increasing setup and operational complexity.[2] For Wilderfolk, the appropriate default is a **modular in-process game architecture**: focused modules, a presentation layer, typed commands, an authoritative simulation/worker boundary, and explicit save/load handling.

| Prefer this first | Add this only after a demonstrated need |
|---|---|
| A named TypeScript module with one domain responsibility | A broad manager, generic service layer, or utility dump |
| A direct typed call across an existing local boundary | A general event bus or queue used only to avoid defining ownership |
| A focused React hook or component | A global UI store for feature-local state |
| A pure helper plus explicit inputs/outputs | A hidden singleton or shared mutable state |
| An existing simulation cadence and owner | An additional tick layer or parallel simulation loop |

Do not interpret this as a ban on larger architecture. Use a major architectural pattern when measurable concurrency, performance, reliability, distribution, or team-scale requirements require it. The decision should be visible, intentional, and proportionate to the problem.

### Test by risk, not by ritual

Coverage is a useful signal, but it does not prove behavior is correct. SystemsArchitect.io recommends combining automated checks with realistic scenarios and distinguishes unit, integration, functional, regression, performance, usability, compatibility, and exploratory testing.[3] For Wilderfolk, choose the smallest test mix that can expose the most likely regression.

| Change | Proportionate evidence |
|---|---|
| Pure calculation, selector, or conversion | Unit test with normal, boundary, and invalid input where relevant |
| Interaction between local modules | Integration test or deterministic simulation scenario |
| Player-visible UI or gameplay flow | Manual play check or screenshot in addition to focused automated coverage |
| Worker command, delta, save/load, or migration behavior | Command/result verification plus a representative save/import round trip |
| Performance-sensitive simulation loop | Before/after measurement together with a behavior-regression check |
| Creative prototype | A short exploratory play check; add durable tests only when the behavior is kept |

A valuable reassessment after a change is brief: did the chosen boundary stay clear, did the implementation introduce a new source of truth or duplicated decision, did the expected player behavior occur, and did the change make the next related feature easier or harder? If the answer reveals a design problem, improve the seam rather than adding a broad workaround.

### Sources

[1] [SystemsArchitect.io, *Getting Started*](https://www.systemsarchitect.io/docs) — the framework identifies request, requirements, review, resolution, implementation, and reassessment workflows, together with an architecture-pattern checklist. Accessed 2026-08-28.

[2] [SystemsArchitect.io, *Design Funnel / Design Pattern Heuristics*](https://www.systemsarchitect.io/docs/requirements/systems/design-funnel) — describes the increasing complexity and trade-offs of n-tier, microservice, queue-based, and event-driven approaches. Accessed 2026-08-28.

[3] [SystemsArchitect.io, *Testing Checklist*](https://www.systemsarchitect.io/docs/requirements/systems/testing) — describes complementary testing modes and cautions that coverage alone does not establish correctness. Accessed 2026-08-28.
