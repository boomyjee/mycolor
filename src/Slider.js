export class Slider {
    constructor(elementId, onChange = null) {
        this.elementId = elementId;
        this.element = document.getElementById(elementId);
        this.onChange = onChange;
        this.valueDisplay = this.element.parentNode.querySelector(`span.value`);
        this.defaultValue = parseFloat(this.element.value);

        // Добавляем обработчик изменений
        this.element.addEventListener('input', () => {
            this.updateValueDisplay();
            if (this.onChange) {
                this.onChange(this.getValue());
            }
        });

        // Добавляем обработчик двойного клика
        this.element.addEventListener('dblclick', () => {
            this.reset();
        });

        // Инициализируем отображение значения
        this.updateValueDisplay();
    }

    getValue() {
        return parseFloat(this.element.value);
    }

    setValue(value) {
        if (value === undefined) {
            this.reset();
            return;
        }

        this.element.value = value;
        this.updateValueDisplay();
        if (this.onChange) {
            this.onChange(this.getValue());
        }
    }

    updateValueDisplay() {
        if (this.valueDisplay) {
            this.valueDisplay.textContent = this.getValue().toFixed(2);
        }
    }

    reset() {
        this.setValue(this.defaultValue);
    }
} 