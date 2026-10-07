export const AUCTION_TOPICS = Object.freeze([
  {
    id: 'travel', emoji: '✈️', name: 'Путешествия',
    words: ['airport', 'passport', 'hotel', 'ticket', 'suitcase', 'train', 'beach', 'flight', 'plane', 'journey', 'trip', 'travel', 'tourist', 'tourism', 'luggage', 'visa', 'border', 'station', 'platform', 'hostel', 'booking', 'reservation', 'map', 'guide', 'country', 'city', 'island', 'cruise', 'ship', 'ferry', 'route', 'departure', 'arrival', 'terminal', 'gate', 'customs', 'resort', 'camping', 'backpack', 'souvenir'],
  },
  {
    id: 'food', emoji: '🍕', name: 'Еда',
    words: ['bread', 'cheese', 'apple', 'soup', 'meat', 'rice', 'salad', 'banana', 'fish', 'chicken', 'beef', 'pork', 'potato', 'tomato', 'carrot', 'onion', 'garlic', 'pasta', 'pizza', 'sandwich', 'egg', 'milk', 'butter', 'yogurt', 'fruit', 'vegetable', 'orange', 'lemon', 'grape', 'strawberry', 'sugar', 'salt', 'pepper', 'cake', 'cookie', 'chocolate', 'breakfast', 'lunch', 'dinner', 'dessert'],
  },
  {
    id: 'animals', emoji: '🐶', name: 'Животные',
    words: ['dog', 'cat', 'lion', 'horse', 'monkey', 'elephant', 'bird', 'snake', 'tiger', 'bear', 'wolf', 'fox', 'rabbit', 'mouse', 'rat', 'cow', 'pig', 'sheep', 'goat', 'deer', 'giraffe', 'zebra', 'kangaroo', 'panda', 'frog', 'fish', 'shark', 'whale', 'dolphin', 'turtle', 'crocodile', 'eagle', 'owl', 'duck', 'chicken', 'butterfly', 'bee', 'spider', 'ant', 'penguin'],
  },
  {
    id: 'home', emoji: '🏠', name: 'Дом',
    words: ['table', 'chair', 'bed', 'kitchen', 'window', 'door', 'sofa', 'lamp', 'room', 'bedroom', 'bathroom', 'hall', 'garden', 'floor', 'wall', 'roof', 'stairs', 'desk', 'shelf', 'wardrobe', 'mirror', 'carpet', 'curtain', 'pillow', 'blanket', 'towel', 'shower', 'bath', 'sink', 'oven', 'fridge', 'freezer', 'cupboard', 'balcony', 'garage', 'key', 'clock', 'picture', 'furniture', 'house'],
  },
  {
    id: 'clothes', emoji: '👕', name: 'Одежда',
    words: ['shirt', 'dress', 'jeans', 'shoes', 'jacket', 'hat', 'skirt', 'socks', 'trousers', 'coat', 'sweater', 'shorts', 'boots', 'scarf', 'gloves', 'belt', 'tie', 'suit', 'blouse', 'hoodie', 'uniform', 'pocket', 'button', 'zipper', 'cap', 'sandals', 'trainers', 'underwear', 'pyjamas', 'raincoat', 'necklace', 'bracelet', 'ring', 'watch', 'bag', 'handbag', 'backpack', 'size', 'fashion', 'clothing'],
  },
  {
    id: 'work', emoji: '💼', name: 'Работа',
    words: ['office', 'manager', 'salary', 'meeting', 'colleague', 'job', 'company', 'project', 'work', 'career', 'boss', 'employee', 'team', 'client', 'customer', 'business', 'task', 'report', 'email', 'computer', 'interview', 'contract', 'deadline', 'schedule', 'department', 'director', 'assistant', 'engineer', 'designer', 'teacher', 'doctor', 'lawyer', 'accountant', 'factory', 'promotion', 'experience', 'skill', 'profession', 'workplace', 'vacancy'],
  },
  {
    id: 'money', emoji: '💰', name: 'Деньги',
    words: ['bank', 'cash', 'card', 'price', 'salary', 'loan', 'payment', 'account', 'money', 'coin', 'wallet', 'bill', 'credit', 'debit', 'budget', 'income', 'expense', 'cost', 'discount', 'change', 'currency', 'dollar', 'euro', 'pound', 'tax', 'fee', 'debt', 'saving', 'profit', 'loss', 'rent', 'receipt', 'cashier', 'purchase', 'refund', 'insurance', 'mortgage', 'finance', 'wealth', 'fund'],
  },
  {
    id: 'nature', emoji: '🌦️', name: 'Погода и природа',
    words: ['rain', 'snow', 'sun', 'wind', 'cloud', 'river', 'mountain', 'forest', 'weather', 'storm', 'thunder', 'lightning', 'fog', 'ice', 'sky', 'sea', 'ocean', 'lake', 'waterfall', 'hill', 'valley', 'field', 'tree', 'flower', 'grass', 'leaf', 'plant', 'earth', 'moon', 'star', 'season', 'spring', 'summer', 'autumn', 'winter', 'temperature', 'climate', 'nature', 'desert', 'island'],
  },
  {
    id: 'transport', emoji: '🚗', name: 'Транспорт',
    words: ['car', 'bus', 'train', 'bicycle', 'taxi', 'plane', 'ship', 'subway', 'transport', 'truck', 'van', 'motorcycle', 'scooter', 'tram', 'boat', 'ferry', 'helicopter', 'airport', 'station', 'stop', 'road', 'street', 'traffic', 'driver', 'passenger', 'ticket', 'platform', 'route', 'journey', 'wheel', 'engine', 'seat', 'petrol', 'bridge', 'tunnel', 'railway', 'parking', 'highway', 'vehicle', 'flight'],
  },
  {
    id: 'people', emoji: '🙂', name: 'Человек и эмоции',
    words: ['happy', 'angry', 'sad', 'tired', 'excited', 'afraid', 'surprised', 'calm', 'worried', 'nervous', 'bored', 'proud', 'shy', 'kind', 'friendly', 'honest', 'brave', 'clever', 'funny', 'serious', 'young', 'old', 'tall', 'short', 'strong', 'weak', 'beautiful', 'handsome', 'person', 'people', 'friend', 'family', 'child', 'adult', 'man', 'woman', 'boy', 'girl', 'feeling', 'emotion'],
  },
]);

export const AUCTION_TOPIC_BY_ID = new Map(AUCTION_TOPICS.map((topic) => [topic.id, {
  ...topic,
  wordSet: new Set(topic.words),
}]));
