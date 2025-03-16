export class Checkbox {
    constructor(elementId, options = {}) {
        this.container = document.getElementById(elementId);
        this.onChange = options.onChange || (() => {});
        this.value = options.value || false;

        this.render();
        this.setupListeners();
    }

    render() {
        this.container.innerHTML = `
            <label class="checkbox-label">
                <input type="checkbox" ${this.value ? 'checked' : ''}>
                <span>${this.container.dataset.label || ''}</span>
            </label>
        `;
        this.checkbox = this.container.querySelector('input[type="checkbox"]');
    }

    setupListeners() {
        this.checkbox.addEventListener('change', (e) => {
            this.value = e.target.checked;
            this.onChange(this.value);
        });
    }

    getValue() {
        return this.value;
    }

    setValue(value) {
        this.value = Boolean(value);
        this.checkbox.checked = this.value;
        this.onChange(this.value);
    }
} 