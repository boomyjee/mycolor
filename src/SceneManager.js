import { FileStorage } from './FileStorage.js';

export class SceneManager {
    constructor(getInterfaceState,setInterfaceState) {
        this.scenes = new Map();
        this.currentScene = null;
        this.sceneCounter = 1;

        this.setInterfaceState = setInterfaceState;
        this.getInterfaceState = getInterfaceState;

        this.addSceneBtn = document.querySelector('.add-scene-btn');
        this.scenesList = document.querySelector('.scenes-list');

        this.fileStorage = new FileStorage();
        this.fileStorage.init();
        
        this.setupListeners();
        this.restoreScenesState();

        // Сохраняем состояние при закрытии страницы
        setInterval(() => {
            this.saveScenesState();
        }, 3000);
    }

    async restoreScenesState(){
        const savedScenesJSON = localStorage.getItem('editorScenes');
        const savedScenes = JSON.parse(savedScenesJSON);

        for (var scene of savedScenes.allScenes) {
            if (scene.state.fileHandle) {
                scene.state.fileHandle = await this.fileStorage.getFileHandle(scene.uid);
            }
        }

        this.setValue(savedScenes);
        if (this.scenes.size === 0) {
            this.createScene();
        }
    }

    async saveScenesState(){
        if (this.currentScene) {
            this.currentScene.state = await this.getInterfaceState();
        }        
        let value = this.getValue();
        for (var scene of value.allScenes) {
            if (scene.state.fileHandle) {
                await this.fileStorage.saveFileHandle(scene.uid, scene.state.fileHandle);
            }
        }
        localStorage.setItem('editorScenes', JSON.stringify(value));
    }

    setupListeners() {
        this.addSceneBtn.addEventListener('click', () => this.createScene());
        
        // Делегирование событий для табов сцен
        this.scenesList.addEventListener('click', (e) => {
            const sceneTab = e.target.closest('.scene-tab');
            const closeBtn = e.target.closest('.close');
            
            if (closeBtn) {
                const sceneId = sceneTab.dataset.scene;
                this.deleteScene(sceneId);
                e.stopPropagation();
            } else if (sceneTab) {
                const sceneId = sceneTab.dataset.scene;
                if (this.currentScene.id != sceneId) {
                    this.switchScene(sceneId);
                }
            }
        });
    }

    createScene() {
        const sceneId = this.sceneCounter++;
        
        // Создаем новый таб
        const tab = document.createElement('button');
        tab.className = 'scene-tab';
        tab.dataset.scene = sceneId;
        tab.innerHTML = `
            Сцена ${sceneId}
            <span class="close">×</span>
        `;
        
        this.scenesList.appendChild(tab);

        // Создаем объект сцены
        const scene = {
            id: sceneId,
            uid: crypto.randomUUID(),
            state: {}, // Будет содержать состояние интерфейса
        };
        
        this.scenes.set(sceneId, scene);
        
        // Переключаемся на новую сцену
        this.switchScene(sceneId);
    }

    async switchScene(sceneId) {

        if (this.currentScene) {
            this.currentScene.state = await this.getInterfaceState();
        }

        // Обновляем активный таб
        this.scenesList.querySelectorAll('.scene-tab').forEach(tab => {
            tab.classList.toggle('active', tab.dataset.scene === sceneId.toString());
        });

        const scene = this.scenes.get(parseInt(sceneId));
        this.currentScene = scene;

        // Восстанавливаем состояние сцены
        if (this.setInterfaceState) {
            await this.setInterfaceState(scene.state);
        }
    }

    deleteScene(sceneId) {
        const scene = this.scenes.get(parseInt(sceneId));
        if (!scene) return;

        // Если удаляем текущую сцену, переключаемся на другую
        if (this.currentScene === scene) {
            const scenes = Array.from(this.scenes.values());
            const nextScene = scenes.find(s => s.id !== scene.id);
            this.currentScene = null;
            if (nextScene) {
                this.switchScene(nextScene.id);
            } else {
                this.createScene();
            }
        }

        // Удаляем таб
        const tab = this.scenesList.querySelector(`[data-scene="${sceneId}"]`);
        if (tab) tab.remove();

        // Удаляем сцену из коллекции
        this.scenes.delete(parseInt(sceneId));

        // Если удалили последнюю сцену, создаем новую
        if (this.scenes.size === 0) {
            this.createScene();
        }
    }

    // Получить состояние текущей сцены
    getValue() {
        if (!this.currentScene) return null;
        
        return {
            sceneId: this.currentScene.id,
            state: this.currentScene.state,
            allScenes: Array.from(this.scenes.entries()).map(([id, scene]) => ({
                id,
                uid: scene.uid,
                state: scene.state
            }))
        };
    }

    // Установить состояние сцен
    async setValue(value) {
        if (!value) return;

        // Очищаем текущие сцены
        this.scenes.clear();
        this.scenesList.innerHTML = '';

        // Восстанавливаем все сцены
        for (const scene of value.allScenes) {
            const tab = document.createElement('button');
            tab.className = 'scene-tab';
            tab.dataset.scene = scene.id;
            tab.innerHTML = `
                Сцена ${scene.id}
                <span class="close">×</span>
            `;
            
            this.scenesList.appendChild(tab);

            this.scenes.set(scene.id, {
                id: scene.id,
                uid: scene.uid,
                state: scene.state
            });

            // Обновляем счетчик сцен
            this.sceneCounter = Math.max(this.sceneCounter, scene.id + 1);
        }

        // Переключаемся на сохраненную активную сцену
        if (value.sceneId) {
            await this.switchScene(value.sceneId);
        } else if (this.scenes.size > 0) {
            // Если активная сцена не указана, переключаемся на первую
            const firstSceneId = this.scenes.keys().next().value;
            await this.switchScene(firstSceneId);
        }
    }
} 